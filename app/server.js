// ==========================
// server.js - WhatsApp Bot Salón de Belleza
// ==========================
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');
const qrcode = require('qrcode');
const { ref, get, set } = require('firebase/database');
const db = require('./firebase'); // tu archivo firebase.js
const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');

// ==========================
// Configuración del servidor
// ==========================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================
// Variables globales
// ==========================
let sock;
let isConnected = false;
let qrCode = '';
let mensajesEnviados = 0;
let mensajesRecibidos = 0;
let chatsActivos = new Set();
let conversacionesActivas = new Map();
const logger = pino({ level: 'silent' });
const AUTH_FOLDER = 'auth_info_baileys';

// ==========================
// Función para iniciar el bot
// ==========================
async function iniciarBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger,
            browser: ['Salón Bot', 'Chrome', '1.0'],
            syncFullHistory: true
        });

        // =======================
        // Manejo de conexión
        // =======================
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) qrCode = await qrcode.toDataURL(qr);

            if (connection === 'open') {
                isConnected = true;
                qrCode = '';
                console.log('✅ Bot conectado a WhatsApp');
            }

            if (connection === 'close') {
                isConnected = false;
                const code = lastDisconnect?.error?.output?.statusCode;
                console.log('❌ Conexión cerrada', lastDisconnect?.error);

                // Reconectar automáticamente salvo que sea sesión inválida
                if (code !== DisconnectReason.loggedOut) {
                    console.log('🔄 Reintentando conexión en 5s...');
                    setTimeout(iniciarBot, 5000);
                } else {
                    console.log('⚠️ Sesión cerrada, eliminando credenciales...');
                    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                    qrCode = '';
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // =======================
        // Contar mensajes y chats
        // =======================
        sock.ev.on('messages.upsert', async (m) => {
            if (!isConnected) return;
            const message = m.messages[0];
            if (!message.message || message.key.fromMe) return;

            const from = message.key.remoteJid;
            if (!from || from.endsWith('@broadcast') || from.endsWith('@status')) return;

            mensajesRecibidos += 1;
            chatsActivos.add(from);

            const texto = message.message.conversation || message.message.extendedTextMessage?.text || message.message.imageMessage?.caption;
            if (texto) await procesarMensajeWhatsApp(texto, from);
        });

        sock.ev.on('messages.update', () => mensajesEnviados++);

    } catch (error) {
        console.error('❌ Error iniciando bot:', error);
        setTimeout(iniciarBot, 10000);
    }
}

// Inicia el bot
iniciarBot();

// ==========================
// Función para extraer texto de mensaje
// ==========================
function extractMessageText(message) {
    return (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        null
    );
}

// ==========================
// Procesar mensajes entrantes
// ==========================
async function procesarMensajeWhatsApp(mensaje, telefono) {
    const clientes = await getClientes();
    const telSinCodigo = telefono.replace('@s.whatsapp.net', '');
    let cliente = clientes[telSinCodigo];

    if (!conversacionesActivas.has(telefono)) {
        conversacionesActivas.set(telefono, {
            paso: cliente ? 'inicio' : 'registrar_cliente',
            datosTemporales: {},
            ultimaActividad: new Date()
        });
    }

    const conversacion = conversacionesActivas.get(telefono);
    conversacion.ultimaActividad = new Date();
    if (verificarComandosCancelacion(mensaje, telefono, conversacion)) return;

    if (!cliente && conversacion.paso === 'registrar_cliente') {
        await enviarMensaje(telefono, "👋 ¡Hola! Para registrarte, por favor dime tu nombre:");
        conversacion.paso = 'capturar_nombre';
        return;
    }

    // Actualizar paso inicial según si hay cliente o no
    if (!cliente && conversacion.paso === 'registrar_cliente') {
        conversacion.paso = 'capturar_nombre';
    } else if (cliente && conversacion.paso === 'inicio') {
        conversacion.paso = 'menu_principal';
        await enviarMensaje(telefono, `👋 Hola ${cliente.nombre}, bienvenido de nuevo al *Salón de Belleza JazminNails.* 💅`);
    }

    // Llamar al flujo principal después de actualizar el paso
    await procesarEstadoConversacion(mensaje, telefono, conversacion);

    // TODO: procesar estado de la conversación
    conversacionesActivas.set(telefono, conversacion);
}

// ==========================
// Funciones Firebase
// ==========================
async function getClientes() {
    const snapshot = await get(ref(db, 'clientes'));
    return snapshot.exists() ? snapshot.val() : {};
}

async function saveCliente(telefono, nombre) {
    await set(ref(db, `clientes/${telefono}`), { nombre, telefono });
    console.log(`✅ Cliente registrado: ${nombre} (${telefono})`);
}

async function getServicios() {
    const snapshot = await get(ref(db, 'servicios'));
    return snapshot.exists() ? Object.values(snapshot.val()) : [];
}

// ==========================
// Nueva función para obtener citas desde Firebase
// ==========================
async function getCitas() {
    try {
        const snapshot = await get(ref(db, 'citas'));
        return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
        console.error('Error al obtener citas:', error);
        return {};
    }
}

// ==========================
// Nueva función para crear una cita
// ==========================
async function crearCita(datosCita) {
    try {
        const citaId = uuidv4();
        await set(ref(db, `citas/${citaId}`), {
            ...datosCita,
            estado: 'Reservada',
            fechaCreacion: new Date().toISOString(),
            id: citaId
        });
        return citaId;
    } catch (error) {
        console.error('Error al crear cita:', error);
        throw error;
    }
}

// ==========================
// API Endpoints para el calendario
// ==========================

// Endpoint para obtener todas las citas
app.get('/api/citas', async (req, res) => {
    try {
        const citas = await getCitas();
        const clientes = await getClientes();
        const servicios = await getServicios();

        // Convertir servicios array a objeto para búsqueda rápida
        const serviciosObj = {};
        servicios.forEach(s => serviciosObj[s.id] = s);

        // Procesar citas para el calendario
        const citasProcesadas = Object.entries(citas)
            .filter(([id, cita]) => cita.estado === 'Reservada')
            .map(([id, cita]) => {
                const cliente = clientes[cita.clienteId] || { nombre: 'Cliente desconocido', telefono: cita.clienteId };
                const servicio = serviciosObj[cita.servicioId] || { nombre: 'Servicio desconocido', duracion: 60, precio: 0 };

                return {
                    id: id,
                    client: cliente.nombre,
                    service: servicio.nombre,
                    fecha: cita.fecha,
                    hora: cita.hora,
                    status: 'confirmed',
                    manicurista: cita.manicuristaId,
                    notas: cita.notas || '',
                    telefono: cliente.telefono,
                    duracion: servicio.duracion || 60,
                    precio: servicio.precio || 0
                };
            });

        res.json(citasProcesadas);
    } catch (error) {
        console.error('Error en /api/citas:', error);
        res.status(500).json({ error: 'Error al obtener citas' });
    }
});

// Endpoint para crear una nueva cita
app.post('/api/citas', async (req, res) => {
    try {
        const { clienteId, servicioId, fecha, hora, manicuristaId, notas } = req.body;
        
        // Validar datos requeridos
        if (!clienteId || !servicioId || !fecha || !hora) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        // Validar que el cliente existe
        const clientes = await getClientes();
        if (!clientes[clienteId]) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Validar que el servicio existe
        const servicios = await getServicios();
        const servicio = servicios.find(s => s.id === servicioId);
        if (!servicio) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        // Crear la cita
        const datosCita = {
            clienteId,
            servicioId,
            fecha,
            hora,
            manicuristaId: manicuristaId || 'Sin asignar',
            notas: notas || ''
        };

        const citaId = await crearCita(datosCita);
        
        res.json({ 
            success: true, 
            message: 'Cita creada exitosamente',
            citaId: citaId 
        });
    } catch (error) {
        console.error('Error al crear cita:', error);
        res.status(500).json({ error: 'Error al crear cita' });
    }
});

// Endpoint para obtener clientes
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await getClientes();
        const clientesArray = Object.entries(clientes).map(([id, cliente]) => ({
            id: id,
            nombre: cliente.nombre,
            telefono: cliente.telefono
        }));
        res.json(clientesArray);
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ error: 'Error al obtener clientes' });
    }
});

// Endpoint para obtener servicios
app.get('/api/servicios', async (req, res) => {
    try {
        const servicios = await getServicios();
        res.json(servicios);
    } catch (error) {
        console.error('Error al obtener servicios:', error);
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
});

// Endpoint para cancelar una cita
app.post('/api/citas/:id/cancelar', async (req, res) => {
    try {
        const citaId = req.params.id;
        await set(ref(db, `citas/${citaId}/estado`), 'Cancelada');
        await set(ref(db, `citas/${citaId}/fechaCancelacion`), new Date().toISOString());
        
        res.json({ success: true, message: 'Cita cancelada correctamente' });
    } catch (error) {
        console.error('Error al cancelar cita:', error);
        res.status(500).json({ error: 'Error al cancelar cita' });
    }
});

// ==========================
// Dashboard principal con calendario
// ==========================
app.use("/servicios", express.static(path.join(__dirname, "servicios")));
app.use("/clientes", express.static(path.join(__dirname, "clientes")));

app.get("/", (req, res) => {
    const statusBot = isConnected ? "✅ Conectado" : "❌ Desconectado";

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dashboard Bot WhatsApp</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
        <style>
            body { background-color: #f5f7fa; font-family: Arial, sans-serif; }
            .card { border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.1); transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out; }
            .card:hover { transform: scale(1.05); box-shadow:0 6px 18px rgba(0,0,0,0.2); cursor:pointer; }
            .status { font-size:1.2rem; font-weight:bold; }
            .qr-img { max-width:250px; border:3px solid #eee; border-radius:8px; }
            
            /* Estilos del calendario */
            .calendar-container { background: white; border-radius: 16px; padding: 20px; box-shadow:0 4px 15px rgba(0,0,0,0.1); }
            .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .calendar-nav { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #007bff; }
            .calendar-nav:hover { color: #0056b3; }
            .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
            .calendar-day-header { text-align: center; font-weight: bold; padding: 10px; background: #f8f9fa; border-radius: 8px; }
            .calendar-day { text-align: center; padding: 15px 5px; cursor: pointer; border-radius: 8px; transition: all 0.2s; position: relative; min-height: 50px; }
            .calendar-day:hover { background: #e3f2fd; }
            .calendar-day.other-month { color: #ccc; }
            .calendar-day.today { background: #007bff; color: white; font-weight: bold; }
            .calendar-day.has-appointments { background: #fff3cd; border: 2px solid #ffc107; }
            .appointment-dot { position: absolute; top: 5px; right: 5px; width: 8px; height: 8px; background: #dc3545; border-radius: 50%; }
            
            /* Lista de citas */
            .appointment-list { max-height: 400px; overflow-y: auto; }
            .appointment-item { background: white; border-left: 4px solid #007bff; padding: 15px; margin-bottom: 10px; border-radius: 0 8px 8px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer; transition: all 0.2s; }
            .appointment-item:hover { transform: translateX(5px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .appointment-item.urgent { border-left-color: #dc3545; animation: pulse 2s infinite; }
            @keyframes pulse { 0% { box-shadow: 0 2px 8px rgba(0,0,0,0.1); } 50% { box-shadow: 0 4px 16px rgba(220,53,69,0.3); } 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.1); } }
            .appointment-time { font-weight: bold; color: #007bff; font-size: 1.1rem; }
            .appointment-client { font-size: 1rem; margin: 5px 0; }
            .appointment-service { color: #666; font-size: 0.9rem; }
            .appointment-status { font-size: 0.8rem; padding: 2px 8px; border-radius: 12px; }
            .status-pending { background: #fff3cd; color: #856404; }
            .status-confirmed { background: #d4edda; color: #155724; }
            .status-inprocess { background: #cce5ff; color: #004085; }
            .status-finalized { background: #e2e3e5; color: #383d41; }
            .status-cancelled { background: #f8d7da; color: #721c24; }

            /* Formulario nueva cita */
            .new-appointment-form { text-align: left; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group select, .form-group input, .form-group textarea {
                width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container py-5">
            <h1 class="text-center mb-4">🤖 Dashboard Bot WhatsApp</h1>

            <!-- ... (sección de tarjetas de estadísticas igual que antes) ... -->

            <!-- Nueva sección del calendario -->
            <div class="row g-4 mt-4">
                <div class="col-md-8">
                    <div class="calendar-container">
                        <div class="calendar-header">
                            <button class="calendar-nav" onclick="changeMonth(-1)">❮</button>
                            <h4 id="calendar-month-year"></h4>
                            <button class="calendar-nav" onclick="changeMonth(1)">❯</button>
                        </div>
                        <div class="calendar-grid" id="calendar-grid"></div>
                    </div>
                </div>
                
                <div class="col-md-4">
                    <div class="card p-3">
                        <h5 class="mb-3">📅 Próximos Servicios</h5>
                        <div class="appointment-list" id="appointment-list"></div>
                    </div>
                </div>
            </div>

        </div>

        <script>
            // ... (todas las funciones previas como loadAppointments, updateCalendarDisplay, etc.) ...

            // 🔄 Función para cambiar estado con actualización en tiempo real
            async function changeAppointmentStatus(appointmentId, newStatus) {
                let confirmMessage = '';
                let confirmIcon = 'question';
                
                switch(newStatus) {
                    case 'Finalizada': confirmMessage = '¿Confirmar que el servicio ha sido finalizado?'; confirmIcon = 'success'; break;
                    case 'Cancelada': confirmMessage = '¿Estás seguro de que quieres cancelar esta cita?'; confirmIcon = 'warning'; break;
                    case 'En Proceso': confirmMessage = '¿Marcar el servicio como en proceso?'; confirmIcon = 'info'; break;
                    default: confirmMessage = \`¿Cambiar el estado a \${newStatus}?\`;
                }
                
                const result = await Swal.fire({
                    title: 'Confirmar cambio',
                    text: confirmMessage,
                    icon: confirmIcon,
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cambiar',
                    cancelButtonText: 'Cancelar'
                });
                
                if (result.isConfirmed) {
                    try {
                        const response = await fetch(\`/api/citas/\${appointmentId}/estado\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estado: newStatus })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Estado actualizado',
                                timer: 1500,
                                showConfirmButton: false
                            });

                            // 🔥 Actualizar en tiempo real el badge en la lista sin recargar todo
                            const apt = appointments.find(a => a.id === appointmentId);
                            if (apt) {
                                apt.status = newStatus;

                                const itemEl = document.querySelector(\`.appointment-item[data-id="\${appointmentId}"] .appointment-status\`);
                                if (itemEl) {
                                    itemEl.textContent = newStatus;
                                    itemEl.className = "appointment-status " + getStatusClass(newStatus);
                                }
                            }

                        } else {
                            throw new Error(result.error || 'Error desconocido');
                        }
                    } catch (error) {
                        console.error('Error cambiando estado:', error);
                        Swal.fire({ icon: 'error', title: 'Error', text: error.message });
                    }
                }
            }

            // Devuelve clase CSS según estado
            function getStatusClass(status) {
                switch(status) {
                    case 'Confirmada': return 'status-confirmed';
                    case 'En Proceso': return 'status-inprocess';
                    case 'Finalizada': return 'status-finalized';
                    case 'Cancelada': return 'status-cancelled';
                    default: return 'status-pending';
                }
            }

            // Sobrescribimos updateAppointmentList para inyectar data-id
            function updateAppointmentList() {
                const appointmentList = document.getElementById('appointment-list');
                const today = new Date();
                const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
                
                const upcomingAppointments = appointments
                    .filter(apt => apt.date >= today && apt.date <= nextTwoWeeks)
                    .sort((a, b) => a.date - b.date);
                
                if (upcomingAppointments.length === 0) {
                    appointmentList.innerHTML = '<p class="text-muted text-center">No hay servicios próximos</p>';
                    return;
                }
                
                appointmentList.innerHTML = upcomingAppointments.map(apt => {
                    const timeStr = apt.date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
                    const dateStr = apt.date.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'});
                    const statusClass = getStatusClass(apt.status);

                    return \`
                        <div class="appointment-item" data-id="\${apt.id}" onclick="showAppointmentDetails('\${apt.id}')">
                            <div class="appointment-time">\${timeStr} - \${dateStr}</div>
                            <div class="appointment-client">👤 \${apt.client}</div>
                            <div class="appointment-service">✂️ \${apt.service}</div>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <div class="appointment-status \${statusClass}">\${apt.status}</div>
                            </div>
                        </div>
                    \`;
                }).join('');
            }

            document.addEventListener('DOMContentLoaded', async () => {
                await loadClientes();
                await loadServicios();
                await loadAppointments();
            });
        </script>
    </body>
    </html>
    `);

});

// ==========================
// Endpoint para reiniciar sesión
// ==========================
app.get('/reiniciar', async (req, res) => {
    try {
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        isConnected = false;
        qrCode = '';
        iniciarBot();
        res.send("<h3>🔄 Sesión reiniciada. Ve a / para escanear QR</h3>");
    } catch (err) {
        res.status(500).send("❌ Error al reiniciar: " + err.message);
    }
});

// ==========================
// Iniciar servidor
// ==========================
app.listen(PORT, () => console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`));


// ==========================
// Función placeholder para enviar mensaje
// ==========================
async function enviarMensaje(telefono, texto) {
    if (!sock || !isConnected) return;
    await sock.sendMessage(telefono, { text: texto });
}

function verificarComandosCancelacion(mensajeLower, telefono, conversacion) {
    const comandosCancelacion = [
        'cancelar', 'cancel', 'salir', 'exit', 'menu', 
        'inicio', 'volver', 'atras', 'atrás', 'back',
        'principal', 'home', 'reset', 'reiniciar'
    ];
    
    const esComandoCancelacion = comandosCancelacion.includes(mensajeLower) || 
                                mensajeLower === '0' ||
                                mensajeLower === 'hola';

    if (esComandoCancelacion) {
        // Limpiar datos temporales y volver al menú principal
        conversacion.datosTemporales = {};
        conversacion.paso = 'menu_principal';
        
        // Enviar mensaje de confirmación y mostrar menú
        enviarMensajeCancelacion(telefono, mensajeLower);
        return true;
    }
    
    return false;
}

async function enviarMensajeCancelacion(telefono, comando) {
    let mensaje;
    
    if (comando === 'hola') {
        mensaje = "👋 ¡Hola! Te he llevado al menú principal.";
    } else if (comando === 'cancelar' || comando === 'cancel') {
        mensaje = "❌ Proceso cancelado. Has vuelto al menú principal.";
    } else if (['salir', 'exit'].includes(comando)) {
        mensaje = "👋 Has salido del proceso actual. Aquí tienes el menú principal:";
    } else if (['menu', 'principal', 'home'].includes(comando)) {
        mensaje = "🏠 Has vuelto al menú principal:";
    } else if (['volver', 'atras', 'atrás', 'back'].includes(comando)) {
        mensaje = "↩️ Has vuelto al menú principal:";
    } else if (['reset', 'reiniciar'].includes(comando)) {
        mensaje = "🔄 Proceso reiniciado. Menú principal:";
    } else if (comando === '0') {
        mensaje = "🏠 Menú principal:";
    } else {
        mensaje = "📋 Menú principal:";
    }
    
    // Agregar el menú después del mensaje
    mensaje += `\n\n` +
               `1️⃣ ➕ Agendar nueva cita\n` +
               `2️⃣ 📅 Ver mis citas\n` +
               `3️⃣ ℹ️ Información de contacto\n\n` +
               `4️⃣ 📍 Ver ubicación\n\n` +
               `💡 *Tip:* Puedes escribir "cancelar", "menu" o "0" en cualquier momento para volver aquí.`;
    
    await enviarMensaje(telefono, mensaje);
}


// ==========================
// Flujo conversacional
// ==========================
async function procesarEstadoConversacion(mensaje, telefono, conversacion) {
    const mensajeLower = mensaje.toLowerCase().trim();

    switch (conversacion.paso) {
        case 'capturar_nombre':
            await saveCliente(telefono.replace('@s.whatsapp.net', ''), mensaje);
            await enviarMensaje(telefono,`✅ Gracias ${mensaje}, ya estás registrado.`);
            conversacion.paso = 'menu_principal';
            await procesarEstadoConversacion('', telefono, conversacion);
            break;

        case 'menu_principal':
            await mostrarMenuPrincipal(mensajeLower, telefono, conversacion);
            break;

        case 'seleccionar_servicio':
            await manejarSeleccionServicio(mensaje, telefono, conversacion);
            break;

        case 'seleccionar_fecha':
            await manejarSeleccionFecha(mensaje, telefono, conversacion);
            break;

        case 'seleccionar_hora':
            await manejarSeleccionHora(mensaje, telefono, conversacion);
            break;

        case 'seleccionar_manicurista':
            await manejarSeleccionManicurista(mensaje, telefono, conversacion);
            break;

        case 'confirmar_cita':
            await manejarConfirmarCita(mensaje, telefono, conversacion);
            break;

        case 'gestionar_citas':
            await gestionarCitas(mensaje, telefono, conversacion);
            break;

        case 'reprogramar_fecha':
            await manejarReprogramarFecha(mensaje, telefono, conversacion);
            break;

        case 'reprogramar_hora':
            await manejarReprogramarHora(mensaje, telefono, conversacion);
            break;

        default:
            await enviarMensaje(telefono,'❌ No entendí tu respuesta. Escribe "menu" para ir al menú principal.');
            conversacion.paso = 'menu_principal';
            await procesarEstadoConversacion('', telefono, conversacion);
    }
}


// ==========================
// Menú principal
// ==========================
async function mostrarMenuPrincipal(mensajeLower, telefono, conversacion) {
    switch (mensajeLower) {
        case '1':
            await iniciarAgendamiento(telefono, conversacion);
            break;
        case '2':
            await mostrarCitasCliente(telefono, conversacion);
            break;
        case '3':
            await mostrarInfoSalon(telefono);
            conversacion.paso = 'menu_principal';
            break;
              case '4':
            await mostrarUbicacionSalon(telefono);
           
            break;
        default:
            await enviarMensaje(
               telefono, `¡Hola! 👋 Selecciona una opción del menú:\n` +
                `1️⃣ ➕ Agendar nueva cita\n` +
                `2️⃣ 📅 Ver mis citas\n` +
                `3️⃣ ℹ️ Información de contacto\n\n` +
                `4️⃣ 📍 Ver ubicación\n\n` +
                `💡 *Tip:* Puedes escribir el número de la opción que desees.`
            );
    }
}

// ==========================
// Agendamiento de citas
// ==========================
async function iniciarAgendamiento(telefono, conversacion) {
    const servicios = await getServicios();
    if (!servicios.length) {
        await enviarMensaje( telefono),"⚠️ No hay servicios disponibles ahora.";
        return;
    }

    let mensaje = "💅 *Servicios disponibles:*\n\n";
    servicios.forEach((s, i) => {
        mensaje += `${i + 1}️⃣ *${s.nombre}* - $${s.precio}\n⏱ Duración: ${s.duracion} min\n\n`;
    });
    mensaje += "_Selecciona el número del servicio_\n\n";
    mensaje += "💡 *Tip:* Escribe 'cancelar' o '0' en cualquier momento para volver al menú principal.";


    conversacion.datosTemporales.servicios = servicios;
    conversacion.paso = 'seleccionar_servicio';
    await enviarMensaje(telefono,mensaje);
}




// ==========================
// Funciones WhatsApp
// ==========================
// ==========================

async function mostrarInfoSalon(telefono) {
    const mensaje = `🏢 *INFORMACIÓN DEL SALÓN DE BELLEZA*\n\n` +
                   `📍 *UBICACIÓN:*\n` +
                   `C. Kiliwas 8829,\n` +
                   `Matamoros Norte-Centro-Sur\n` +
                   `Tijuana, B.C.\n` +
                   `CP 22234\n\n` +
                   `🗺️ *Ver ubicación en Google Maps:*\n` +
                   `https://maps.app.goo.gl/Ft82Gy6BraiNay438?g_st=com.google.maps.preview.copy\n\n` +
                   
                   `⏰ *HORARIOS DE ATENCIÓN:*\n` +
                   `🗓️ Lunes a Viernes: 7:00 PM - 9:00 PM\n` +
                   `📅 Sábados y Domingos: 9:00 AM - 9:00 PM\n\n` +
                   
                   `💅 *SERVICIOS Y PRECIOS:*\n` +
                   `• Uñas acrílicas chicas o medianas (1 tono o francés): $200\n` +
                   `• Uñas acrílicas con diseño personalizado: *Cotización*\n` +
                   `  _(Enviar foto para cotizar precio)_\n` +
                   `• Baño de acrílico (1 tono o francés): $180\n` +
                   `• Gel semipermanente: $120\n` +
                   `• Acrílico en pies: $200\n\n` +
                   
                   `💳 *FORMAS DE PAGO:*\n` +
                   `• 💵 Efectivo únicamente\n` +
                   `• 🏦 Transferencia bancaria\n\n` +
                   
                   `📱 *CONTACTO:*\n` +
                   `📞 Teléfono: (xxx) xxx-xxxx\n` +
                   `💬 WhatsApp: Este mismo número\n\n` +
                   
                   `📋 *POLÍTICAS IMPORTANTES:*\n\n` +
                   `📅 *Agendamiento:*\n` +
                   `• Las citas se pueden agendar hasta 2 semanas por adelantado\n` +
                   `• Puedes cancelar tu cita con anticipación\n\n` +
                   
                   `⏰ *Puntualidad:*\n` +
                   `• Llega 10 minutos antes de tu cita\n` +
                   `• Tolerancia máxima: 10 minutos\n` +
                   `• Si excedes este tiempo, tu cita quedará cancelada\n\n` +
                   
                   `⏳ *Duración del servicio:*\n` +
                   `• Tiempo aproximado: 2 horas (dependiendo del servicio)\n\n` +
                   
                   `👥 *Acompañantes:*\n` +
                   `• Sin acompañantes, no hay excepciones\n\n` +
                   
                   `💰 *Cambio:*\n` +
                   `• Acudir con cambio de preferencia\n` +
                   `• Si no puedes conseguirlo, avísame para preparar efectivo\n\n` +
                   
                   `✅ *Confirmación:*\n` +
                   `• La cita se debe confirmar 2 veces:\n` +
                   `  - Un día antes de la cita\n` +
                   `  - El mismo día de la cita\n\n` +
                   
                   `🎯 *OPCIONES:*\n` +
                   `💡 Para agendar una cita, escribe *1*\n` +
                   `📱 Para ver tus citas, escribe *2*`;
    
    await enviarMensaje(telefono, mensaje);
}

async function mostrarUbicacionSalon(telefono) {
   const SALON_CONFIG = {
    nombre: "Salón JazNails", // Cambia por el nombre real de tu salón
    direccion: "C. Kiliwas 8829,Matamoros Norte-Centro-Sur,Matamoros Norte-Centro-Sur,Tijuana, B.C,CP 22234", // Cambia por tu dirección real
    googleMapsUrl: "https://maps.app.goo.gl/Ft82Gy6BraiNay438?g_st=com.google.maps.preview.copy", // Cambia por tus coordenadas reales
    telefono: "+52 664 718 4077", // Cambia por tu teléfono real
    horarios: "Lun-Vie: 7:00 PM - 9:00 PM\n Sab-Dom: 09:00 AM - 09:00 PM" // Cambia por tus horarios reales
};
   
    try {
        console.log("📍 [mostrarUbicacionSalon] Enviando ubicación a:", telefono);
        
        const mensaje = `📍 *UBICACIÓN DEL SALÓN*\n\n` +
                       `🏢 *${SALON_CONFIG.nombre}*\n` +
                       `📍 ${SALON_CONFIG.direccion}\n\n` +
                       `🗺️ *Ver en Google Maps:*\n${SALON_CONFIG.googleMapsUrl}\n\n` +
                       `📞 Teléfono: ${SALON_CONFIG.telefono}\n\n` +
                       `🕒 *Horarios de atención:*\n${SALON_CONFIG.horarios}\n\n` +
                       `¡Te esperamos! 💅✨`;
        
        await enviarMensaje(telefono, mensaje);
        
        console.log("✅ [mostrarUbicacionSalon] Ubicación enviada exitosamente");
        
    } catch (error) {
        console.error("❌ Error enviando ubicación del salón:", error);
        await enviarMensaje(telefono, "❌ Error al obtener la ubicación. Intenta de nuevo más tarde.");
    }
}

// Función para verificar si es un grupo
function esGrupo(jid) {
    // Los grupos en WhatsApp terminan con @g.us
    return jid && jid.endsWith('@g.us');
}

// Función para verificar si es un contacto individual válido
function esContactoIndividual(jid) {
    // Los contactos individuales terminan con @s.whatsapp.net
    if (!jid || !jid.endsWith('@s.whatsapp.net')) {
        return false;
    }
    
    // Extraer el número de teléfono
    const numero = jid.split('@')[0];
    
    // Verificar que sea solo números y tenga longitud válida
    return /^\d{10,15}$/.test(numero);
}




// Función para limpiar número de teléfono para logs (solo para privacidad)
function limpiarTelefono(jid) {
    const numero = jid.split('@')[0];
    return numero.length > 4 ? 
        '*'.repeat(numero.length - 4) + numero.slice(-4) : 
        numero;
}

async function enviarMensaje(jid, mensaje, reintentos = 3) {
    // ✅ VALIDACIÓN: No enviar mensajes si WhatsApp no está conectado
    if (!sock || !isConnected) {
        console.log(`⚠️ WhatsApp no conectado. Mensaje para ${jid}: ${mensaje}`);
        return false;
    }

    try {
        // ✅ VALIDACIÓN: JID debe ser una cadena válida
        if (typeof jid !== 'string' || !jid.includes('@')) {
            console.error(`❌ JID inválido: ${jid}`);
            return false;
        }

        // ✅ FILTRO PRINCIPAL: No enviar mensajes a grupos
        if (esGrupo(jid)) {
            console.log(`🚫 Mensaje bloqueado - No se envían mensajes a grupos: ${jid}`);
            return false;
        }

        // ✅ FILTRO: Solo enviar a contactos individuales válidos
        if (!esContactoIndividual(jid)) {
            console.log(`🚫 Mensaje bloqueado - Tipo de contacto no válido: ${jid}`);
            return false;
        }

        // ✅ VALIDACIÓN: El mensaje no debe estar vacío
        if (!mensaje || mensaje.trim().length === 0) {
            console.log(`⚠️ Mensaje vacío no enviado a ${jid}`);
            return false;
        }

        console.log(`💬 Enviando mensaje a ${limpiarTelefono(jid)}:`);
        console.log(`📝 Contenido: ${mensaje.substring(0, 100)}${mensaje.length > 100 ? '...' : ''}`);

        // Enviar el mensaje original sin limpiar
        await sock.sendMessage(jid, { text: mensaje });
        console.log(`✅ Mensaje enviado exitosamente a ${limpiarTelefono(jid)}`);
        return true;

    } catch (error) {
        console.error(`❌ Error enviando mensaje a ${limpiarTelefono(jid)}:`, error.message || error);

        // Reintentar solo en casos específicos de error de red/timeout
        const shouldRetry = reintentos > 0 && (
            error?.output?.statusCode === 408 || // Request timeout
            error?.output?.statusCode === 440 || // Session timeout
            error?.code === 'ECONNRESET' ||      // Connection reset
            error?.code === 'ENOTFOUND' ||       // DNS resolution failed
            error?.code === 'ETIMEDOUT' ||       // Connection timeout
            error?.message?.includes('timeout') ||
            error?.message?.includes('connection')
        );

        if (shouldRetry) {
            console.log(`🔄 Reintentando enviar mensaje a ${limpiarTelefono(jid)} (${reintentos} intentos restantes)...`);
            
            // Esperar antes de reintentar (backoff exponencial)
            const delay = (4 - reintentos) * 2000; // 2s, 4s, 6s
            await new Promise(r => setTimeout(r, delay));
            
            return enviarMensaje(jid, mensaje, reintentos - 1);
        }

        // Para errores no recuperables, no reintenta pero tampoco crashea
        console.error(`❌ Error definitivo enviando mensaje a ${limpiarTelefono(jid)}. No se reintentará.`);
        return false;
    }
}

// ==========================
// Manejo de selección de servicio
// ==========================
async function manejarSeleccionServicio(mensaje, telefono, conversacion) {
    const seleccion = parseInt(mensaje) - 1;
    const servicios = conversacion.datosTemporales.servicios;

    if (!servicios || servicios.length === 0) {
        await enviarMensaje(telefono,"⚠️ No hay servicios cargados. Por favor, intenta más tarde.");
        conversacion.paso = 'menu_principal';
        return;
    }

    if (isNaN(seleccion) || seleccion < 0 || seleccion >= servicios.length) {
        await enviarMensaje(telefono,
            "❌ Selección inválida. Por favor, escribe el número correspondiente al servicio.\n\n" +
            "💡 *Tip:* Escribe 'cancelar' o '0' para volver al menú principal."
        );
        return;
    }

    const servicioSeleccionado = servicios[seleccion];
    conversacion.datosTemporales.servicioSeleccionado = servicioSeleccionado;
    conversacion.paso = 'seleccionar_fecha';

    await enviarMensaje(
        telefono,
        `Has seleccionado: *${servicioSeleccionado.nombre}* - $${servicioSeleccionado.precio}\n` +
        `⏱ Duración: ${servicioSeleccionado.duracion} min\n\n` +
        `Por favor, indica la fecha que deseas (ejemplo: 25/08/2025).\n\n` +
        `💡 *Tip:* Escribe 'cancelar' para cancelar o 'atrás' para volver al menú.`
    );
}

// ==========================
// Manejo de selección de fecha
// ==========================
async function manejarSeleccionFecha(mensaje, telefono, conversacion) {
    const fecha = mensaje.trim();
    const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;

    if (!regexFecha.test(fecha)) {
        await enviarMensaje(
            telefono,
            "❌ Formato de fecha inválido. Escribe la fecha en formato DD/MM/AAAA (ejemplo: 25/08/2025).\n\n" +
            "💡 *Tip:* Escribe 'cancelar' para cancelar el proceso."
        );
        return;
    }

    const [dia, mes, anio] = fecha.split("/").map(Number);
    const fechaSeleccionada = new Date(anio, mes - 1, dia);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const maxFecha = new Date();
    maxFecha.setDate(hoy.getDate() + 14);

    if (fechaSeleccionada < hoy) {
        await enviarMensaje(
            telefono,
            "❌ La fecha no puede ser anterior a hoy. Por favor selecciona otra fecha.\n\n" +
            "💡 *Tip:* Escribe 'menu' para volver al inicio."
        );
        return;
    }

    if (fechaSeleccionada > maxFecha) {
        await enviarMensaje(
            telefono,
            "❌ Solo se pueden agendar citas hasta 2 semanas desde hoy. Por favor selecciona otra fecha.\n\n" +
            "💡 *Tip:* Escribe 'cancelar' para cancelar el proceso."
        );
        return;
    }

    conversacion.datosTemporales.fechaSeleccionada = fecha;
    conversacion.paso = 'seleccionar_hora';
    
    await enviarMensaje(
        telefono,
        `✅ Fecha seleccionada: ${fecha}\n` +
        `Por favor, indica la hora que deseas (ejemplo: 15:30).\n\n` +
        `💡 *Tip:* Escribe 'atrás' para cambiar la fecha o 'cancelar' para cancelar.`
    );
}




//Manejar la fecha y horarios del salon
async function manejarSeleccionHora(mensaje, telefono, conversacion) {
    const hora = mensaje.trim(); // formato HH:MM
    const regexHora = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    // Si hay sugerencias pendientes, verificar si es una selección de sugerencia
      if (conversacion.datosTemporales.sugerenciasHorarios) {
        const procesadoComoSugerencia = await manejarSugerenciaHorario(mensaje, telefono, conversacion);
        if (procesadoComoSugerencia) {
            return;
        }
    }

    if (!regexHora.test(hora)) {
        await enviarMensaje(
            telefono,
            "❌ Formato de hora inválido. Escribe la hora en formato HH:MM (ejemplo: 15:30).\n\n" +
            "💡 *Tip:* Escribe 'menu' para volver al inicio o 'atrás' para cambiar la fecha."
        );
        return;
    }

    const fechaSeleccionada = conversacion.datosTemporales.fechaSeleccionada;
    const servicioSeleccionado = conversacion.datosTemporales.servicioSeleccionado;

    if (!fechaSeleccionada || !servicioSeleccionado) {
        await enviarMensaje(
            telefono, "❌ Faltan datos de la reserva. Por favor vuelve al menú principal e intenta de nuevo."+
            
              "💡 *Tip:* Escribe 'menu' para volver al inicio."
        );
        conversacion.paso = 'inicio';
        return;
    }

    // Validar horario del salón
    if (!esHorarioValido(fechaSeleccionada, hora)) {
        await enviarMensaje(
            telefono, "❌ La hora seleccionada no está dentro del horario permitido del salón.\n" +
            "⏰ Lunes a Viernes: 19:00 - 21:00\n" +
            "📅 Sábados y Domingos: 09:00 - 21:00\n" +
            "Por favor selecciona otra hora."+
              "💡 *Tip:* Escribe 'menu' para volver al inicio."
        );
        return;
    }

    // Validar que el servicio termine dentro del horario de trabajo
    if (!validarHorarioConDuracion(fechaSeleccionada, hora, servicioSeleccionado.duracion)) {
        await enviarMensaje(
            telefono, "❌ El servicio se extendería más allá del horario de cierre del salón.\n" +
            `⏱ Tu servicio dura ${servicioSeleccionado.duracion} minutos.\n` +
            "Por favor selecciona una hora más temprana."+
              "💡 *Tip:* Escribe 'menu' para volver al inicio."
        );
        return;
    }

    // Verificar disponibilidad de las manicuristas considerando duración
    const manicuristas = ['Jazmín Leon'];
    const manicuristasDisponibles = [];
    const conflictosDetallados = {};

    for (let manicurista of manicuristas) {
        const disponible = await verificarDisponibilidad(
            fechaSeleccionada, 
            hora, 
            manicurista, 
            servicioSeleccionado.duracion
        );

        if (disponible) {
            manicuristasDisponibles.push(manicurista);
        } else {
            // Obtener detalles del conflicto
            const conflictos = await obtenerDetallesConflictos(
                fechaSeleccionada, 
                hora, 
                manicurista, 
                servicioSeleccionado.duracion
            );
            conflictosDetallados[manicurista] = conflictos;
        }
    }

    if (manicuristasDisponibles.length === 0) {
        // No hay disponibilidad, mostrar conflictos y sugerir horarios alternativos
        let mensajeConflicto = "⚠️ Lo siento, no hay disponibilidad en el horario solicitado.\n\n"+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.";
        
        // Mostrar por qué no está disponible
        for (let [manicurista, conflictos] of Object.entries(conflictosDetallados)) {
            if (conflictos.length > 0) {
                const conflicto = conflictos[0];
                mensajeConflicto += `💅 ${manicurista} tiene una cita de ${conflicto.horaInicio} a ${conflicto.horaFin}\n`;
            }
        }

        // Sugerir horarios alternativos
        const sugerencias = await sugerirHorariosAlternativos(
            fechaSeleccionada, 
            hora, 
            manicuristas[0], // Usar la primera manicurista para las sugerencias
            servicioSeleccionado.duracion
        );

        if (sugerencias.length > 0) {
            mensajeConflicto += "\n🕒 *Horarios disponibles sugeridos:*\n"+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.";
            sugerencias.forEach((sugerencia, index) => {
                mensajeConflicto += `${index + 1}️⃣ ${sugerencia.hora}\n`;
            });
            mensajeConflicto += "\nEscribe el número del horario que prefieras o indica otra hora:"+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.";
            
            // Guardar sugerencias para procesarlas si el usuario elige una
            conversacion.datosTemporales.sugerenciasHorarios = sugerencias;
        } else {
            mensajeConflicto += "\n❌ No hay otros horarios disponibles para esta fecha. Por favor elige otra fecha."
            +
              "💡 *Tip:* Escribe 'menu' para volver al inicio.";
            conversacion.paso = 'seleccionar_fecha';
        }

        await enviarMensaje(telefono, mensajeConflicto);
        return;
    }

    // Si hay disponibilidad, continuar con el flujo normal
    conversacion.datosTemporales.hora = hora;
    conversacion.datosTemporales.manicuristasDisponibles = manicuristasDisponibles;

    let mensajeManicuristas = "💅 Selecciona la manicurista disponible:\n"+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.";
    manicuristasDisponibles.forEach((m, i) => {
        mensajeManicuristas += `${i + 1}️⃣ ${m}\n`;
    });

    await enviarMensaje(telefono, mensajeManicuristas);
    conversacion.paso = 'seleccionar_manicurista';
}




// Manejar selección de manicurista
async function manejarSeleccionManicurista(mensaje, telefono, conversacion) {
    const disponibles = conversacion.datosTemporales.manicuristasDisponibles || [];
    const seleccion = parseInt(mensaje) - 1;

   
    if (isNaN(seleccion) || seleccion < 0 || seleccion >= disponibles.length) {
        await enviarMensaje(
            telefono,
            '❌ Opción inválida. Selecciona el número correcto de la manicurista disponible.\n\n' +
            '💡 *Tip:* Escribe "cancelar" para cancelar el agendamiento.'
        );
        return;
    }

    conversacion.datosTemporales.manicurista = disponibles[seleccion];
    await enviarMensaje(telefono,'✅ Confirmar cita? (sí/no)'+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.");
    conversacion.paso = 'confirmar_cita';
}

// Manejar confirmación de cita
async function manejarConfirmarCita(mensaje, telefono, conversacion) {
    const mensajeLower = mensaje.toLowerCase();
    
    if (mensajeLower !== 'sí' && mensajeLower !== 'si') {
        await enviarMensaje(telefono, "Cita cancelada. Volviendo al menú principal.");
        conversacion.paso = 'menu_principal';
        return;
    }

    try {
        const resultado = await guardarCitaFirebase(telefono, conversacion);

        const telefonoNumerico = telefono.replace(/@.*$/, '');
        let nombreCliente = conversacion.datosTemporales.nombreCliente;
        if (!nombreCliente) {
            const clienteSnap = await get(ref(db, `clientes/${telefonoNumerico}`));
            nombreCliente = clienteSnap.exists() ? clienteSnap.val().nombre : 'Desconocido';
        }

        await set(ref(db, `clientes/${telefonoNumerico}`), {
            nombre: nombreCliente,
            telefono: telefonoNumerico
        });

        await enviarMensaje(telefono, resultado.mensaje);

        // ✅ Enviar mensaje a la manicurista correcta
        if (resultado.exito) {
            const manicuristaNombre = conversacion.datosTemporales.manicurista;
            const manicuristaJid = MANICURISTAS[manicuristaNombre];

            if (!manicuristaJid) {
                console.error(`❌ No se encontró la manicurista: ${manicuristaNombre}`+
              "💡 *Tip:* Escribe 'menu' para volver al inicio.");
            } else {
                await enviarMensajeManicurista(
                    manicuristaJid,
                    {
                        id: resultado.mensaje.match(/ID de Cita: (.+)/)[1],
                        fecha: conversacion.datosTemporales.fechaSeleccionada,
                        hora: conversacion.datosTemporales.hora,
                        servicio: conversacion.datosTemporales.servicioSeleccionado.nombre
                    },
                    nombreCliente
                );
            }
        }

        conversacion.paso = resultado.exito ? 'inicio' : 'seleccionar_hora';
    } catch (error) {
        console.error("❌ Error guardando cita:", error);
        await enviarMensaje(telefono, "Error al guardar cita. Intenta escribiendo 'Hola'.");
        conversacionesActivas.set(telefono, {
            paso: 'inicio',
            datosTemporales: {},
            ultimaActividad: new Date()
        });
    }
}

async function guardarCitaFirebase(telefono, conversacion) {
    try {
        const citaId = uuidv4();
        const telefonoNumerico = telefono.replace(/@.*$/, '');

        const nuevaCita = {
            clienteId: telefonoNumerico,
            estado: "Reservada",
            fecha: conversacion.datosTemporales.fechaSeleccionada,
            hora: conversacion.datosTemporales.hora,
            manicuristaId: conversacion.datosTemporales.manicurista,
            servicioId: conversacion.datosTemporales.servicioSeleccionado.id,
            notas: conversacion.datosTemporales.notas || "",
            usuarioCreacion: "chat-bot",
            fechaCreacion: new Date().toISOString()
        };

        await set(ref(db, `citas/${citaId}`), nuevaCita);

        return {
            exito: true,
            mensaje: `✅ Tu cita fue agendada.\n📅 ${nuevaCita.fecha} a las ${nuevaCita.hora}\n💅 Con: ${nuevaCita.manicuristaId}\n🆔 ID de Cita: ${citaId}`
        };

    } catch (error) {
        console.error("❌ Error en guardarCitaFirebase:", error);
        return {
            exito: false,
            mensaje: "❌ No se pudo guardar la cita. Intenta de nuevo."
        };
    }
}

const MANICURISTAS = {
    "Jazmín Leon": "5216442570491@s.whatsapp.net"
};
async function enviarMensajeManicurista(jid, citaData, nombreCliente) {
    if (!sock || !isConnected) {
        console.log(`⚠️ WhatsApp no conectado. Mensaje para ${jid}: ${JSON.stringify(citaData)}`);
        return;
    }

    if (!jid) {
        console.error("❌ No se proporcionó JID de la manicurista.");
        return;
    }

    const mensaje = `💅 Nueva cita agendada\n\n` +
                    `Cliente: ${nombreCliente}\n` +
                    `Servicio: ${citaData.servicio}\n` +
                    `Fecha: ${citaData.fecha}\n` +
                    `Hora: ${citaData.hora}\n` +
                    `ID Cita: ${citaData.id}`;

    try {
        await sock.sendMessage(jid, { text: mensaje });
        console.log(`✅ Notificación enviada a la manicurista: ${jid}`);
    } catch (error) {
        console.error(`❌ Error enviando mensaje a ${jid}:`, error.message);
    }
}


// Verifica si el horario solicitado está disponible
async function verificarDisponibilidad(fecha, hora, manicuristaId, duracionServicio = null) {
    try {
        const snapshot = await get(ref(db, "citas"));
        if (!snapshot.exists()) return true;

        const citas = Object.values(snapshot.val()).filter(cita => 
            cita.fecha === fecha && 
            cita.manicuristaId === manicuristaId &&
            cita.estado !== "Cancelada"
        );

        if (citas.length === 0) return true;

        // Si no se proporciona duración, usar 60 minutos por defecto
        const duracionSolicitud = duracionServicio || 60;

        // Convertir hora solicitada a minutos
        const horaInicioSolicitud = horaAMinutos(hora);
        const horaFinSolicitud = horaInicioSolicitud + parseInt(duracionSolicitud);

        for (let cita of citas) {
            // Obtener duración del servicio existente
            const duracionExistente = await obtenerDuracionServicio(cita.servicioId);
            
            const horaInicioCita = horaAMinutos(cita.hora);
            const horaFinCita = horaInicioCita + duracionExistente;

            // Verificar si hay conflicto de horarios
            const hayConflicto = (
                (horaInicioSolicitud >= horaInicioCita && horaInicioSolicitud < horaFinCita) ||
                (horaFinSolicitud > horaInicioCita && horaFinSolicitud <= horaFinCita) ||
                (horaInicioSolicitud <= horaInicioCita && horaFinSolicitud >= horaFinCita)
            );

            if (hayConflicto) {
                return false; // Hay conflicto
            }
        }

        return true; // No hay conflictos

    } catch (error) {
        console.error("❌ Error verificando disponibilidad:", error);
        return false;
    }
}

async function obtenerDetallesConflictos(fecha, hora, manicuristaId, duracionServicio = 60) {
    try {
        const snapshot = await get(ref(db, "citas"));
        if (!snapshot.exists()) return [];

        const citas = Object.values(snapshot.val()).filter(cita => 
            cita.fecha === fecha && 
            cita.manicuristaId === manicuristaId &&
            cita.estado !== "Cancelada"
        );

        if (citas.length === 0) return [];

        const horaInicioSolicitud = horaAMinutos(hora);
        const horaFinSolicitud = horaInicioSolicitud + parseInt(duracionServicio);
        const conflictos = [];

        for (let cita of citas) {
            const duracionExistente = await obtenerDuracionServicio(cita.servicioId);
            const horaInicioCita = horaAMinutos(cita.hora);
            const horaFinCita = horaInicioCita + duracionExistente;

            const hayConflicto = (
                (horaInicioSolicitud >= horaInicioCita && horaInicioSolicitud < horaFinCita) ||
                (horaFinSolicitud > horaInicioCita && horaFinSolicitud <= horaFinCita) ||
                (horaInicioSolicitud <= horaInicioCita && horaFinSolicitud >= horaFinCita)
            );

            if (hayConflicto) {
                conflictos.push({
                    horaInicio: cita.hora,
                    horaFin: minutosAHora(horaFinCita),
                    duracion: duracionExistente
                });
            }
        }

        return conflictos;
    } catch (error) {
        console.error("❌ Error obteniendo conflictos:", error);
        return [];
    }
}

// Función mejorada para validar horario con duración (NUEVA)
function validarHorarioConDuracion(fecha, hora, duracionMinutos) {
    const [dia, mes, anio] = fecha.split("/");
    const fechaObj = new Date(`${anio}-${mes}-${dia}`);
    const diaSemana = fechaObj.getDay();
    
    const horaInicio = horaAMinutos(hora);
    const horaFin = horaInicio + parseInt(duracionMinutos);
    
    let horaCierre;
    if (diaSemana >= 1 && diaSemana <= 5) {
        // Lunes a Viernes: cierra a las 21:00
        horaCierre = 21 * 60;
    } else {
        // Sábados y Domingos: cierra a las 21:00
        horaCierre = 21 * 60;
    }
    
    return horaFin <= horaCierre;
}

function esFechaPermitida(fecha) {
    const [dia, mes, anio] = fecha.split("/");
    const seleccionada = new Date(`${anio}-${mes}-${dia}`);
    const hoy = new Date();
    const maxFecha = new Date();
    maxFecha.setDate(hoy.getDate() + 14); // solo hasta 2 semanas

    return seleccionada >= hoy && seleccionada <= maxFecha;
}



function esHorarioValido(fecha, hora) {
    const [dia, mes, anio] = fecha.split("/");
    const [h, m] = hora.split(":");
    const date = new Date(`${anio}-${mes}-${dia}T${hora}:00`);
    const diaSemana = date.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const horaEntera = parseInt(h);

    if (diaSemana >= 1 && diaSemana <= 5) {
        // Lunes a Viernes → 19:00 a 21:00
        return horaEntera >= 19 && horaEntera < 21;
    } else if (diaSemana === 0 || diaSemana === 6) {
        // Domingo y Sábado → 09:00 a 21:00
        return horaEntera >= 9 && horaEntera < 21;
    }

    return false;
}
// ==========================
// Funciones mejoradas de disponibilidad
// ==========================

// Convierte hora HH:MM a minutos desde medianoche
function horaAMinutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

// Convierte minutos a formato HH:MM
function minutosAHora(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Verifica si el horario solicitado está disponible considerando duración del servicio
async function verificarDisponibilidadConDuracion(fecha, hora, manicuristaId, duracionServicio = 60) {
    try {
        const snapshot = await get(ref(db, "citas"));
        if (!snapshot.exists()) return { disponible: true, conflictos: [] };

        const citas = Object.values(snapshot.val()).filter(cita => 
            cita.fecha === fecha && 
            cita.manicuristaId === manicuristaId &&
            cita.estado !== "Cancelada"
        );

        if (citas.length === 0) return { disponible: true, conflictos: [] };

        // Convertir hora solicitada a minutos
        const horaInicioSolicitud = horaAMinutos(hora);
        const horaFinSolicitud = horaInicioSolicitud + parseInt(duracionServicio);

        const conflictos = [];

        for (let cita of citas) {
            // Obtener duración del servicio existente
            const servicioSnapshot = await get(ref(db, `servicios/${cita.servicioId}`));
            const duracionExistente = servicioSnapshot.exists() ? 
                parseInt(servicioSnapshot.val().duracion) : 60;

            const horaInicioCita = horaAMinutos(cita.hora);
            const horaFinCita = horaInicioCita + duracionExistente;

            // Verificar si hay conflicto de horarios
            const hayConflicto = (
                (horaInicioSolicitud >= horaInicioCita && horaInicioSolicitud < horaFinCita) ||
                (horaFinSolicitud > horaInicioCita && horaFinSolicitud <= horaFinCita) ||
                (horaInicioSolicitud <= horaInicioCita && horaFinSolicitud >= horaFinCita)
            );

            if (hayConflicto) {
                conflictos.push({
                    horaInicio: cita.hora,
                    horaFin: minutosAHora(horaFinCita),
                    servicio: cita.servicioId,
                    duracion: duracionExistente
                });
            }
        }

        return {
            disponible: conflictos.length === 0,
            conflictos: conflictos
        };

    } catch (error) {
        console.error("❌ Error verificando disponibilidad:", error);
        return { disponible: false, conflictos: [] };
    }
}

// Obtiene la duración de un servicio desde Firebase
async function obtenerDuracionServicio(servicioId) {
    try {
        const snapshot = await get(ref(db, `servicios`));
        if (!snapshot.exists()) return 60; // duración por defecto
        
        const servicios = Object.values(snapshot.val());
        const servicio = servicios.find(s => s.id === servicioId);
        return servicio ? parseInt(servicio.duracion) : 60;
    } catch (error) {
        console.error("❌ Error obteniendo duración del servicio:", error);
        return 60; // duración por defecto
    }
}

// Función para manejar selección de sugerencias de horario
async function manejarSugerenciaHorario(mensaje, telefono, conversacion) {
    const seleccion = parseInt(mensaje) - 1;
    const sugerencias = conversacion.datosTemporales.sugerenciasHorarios || [];

    if (!isNaN(seleccion) && seleccion >= 0 && seleccion < sugerencias.length) {
        // El usuario seleccionó una de las sugerencias
        const horarioSeleccionado = sugerencias[seleccion].hora;
        
        // Procesar la hora seleccionada
        conversacion.datosTemporales.hora = horarioSeleccionado;
        
        // Limpiar las sugerencias
        delete conversacion.datosTemporales.sugerenciasHorarios;
        
        // Continuar con selección de manicurista
        const manicuristas = ['Jazmín Leon'];
        const manicuristasDisponibles = [];

        for (let m of manicuristas) {
            if (await verificarDisponibilidad(
                conversacion.datosTemporales.fechaSeleccionada, 
                horarioSeleccionado, 
                m, 
                conversacion.datosTemporales.servicioSeleccionado.duracion
            )) {
                manicuristasDisponibles.push(m);
            }
        }

        conversacion.datosTemporales.manicuristasDisponibles = manicuristasDisponibles;

        let mensajeManicuristas = `✅ Hora seleccionada: ${horarioSeleccionado}\n\n💅 Selecciona la manicurista disponible:\n`;
        manicuristasDisponibles.forEach((m, i) => {
            mensajeManicuristas += `${i + 1}️⃣ ${m}\n`;
        });

        await enviarMensaje(telefono, mensajeManicuristas);
        conversacion.paso = 'seleccionar_manicurista';
        
        return true; // Indica que se procesó la sugerencia
    }
    
    return false; // No era una selección de sugerencia válida
}

// Sugiere horarios alternativos disponibles
async function sugerirHorariosAlternativos(fecha, horaDeseada, manicuristaId, duracionServicio = 60) {
    try {
        const sugerencias = [];
        const horaDeseadaMinutos = horaAMinutos(horaDeseada);
        
        // Obtener horarios de trabajo según el día
        const [dia, mes, anio] = fecha.split("/");
        const fechaObj = new Date(`${anio}-${mes}-${dia}`);
        const diaSemana = fechaObj.getDay();
        
        let horaInicio, horaFin;
        if (diaSemana >= 1 && diaSemana <= 5) {
            // Lunes a Viernes: 19:00 - 21:00
            horaInicio = 19 * 60; // 19:00 en minutos
            horaFin = 21 * 60;    // 21:00 en minutos
        } else {
            // Sábados y Domingos: 09:00 - 21:00
            horaInicio = 9 * 60;  // 09:00 en minutos
            horaFin = 21 * 60;    // 21:00 en minutos
        }

        // Generar slots de 30 minutos
        const intervalos = [];
        for (let minutos = horaInicio; minutos < horaFin; minutos += 30) {
            if (minutos + parseInt(duracionServicio) <= horaFin) {
                intervalos.push(minutos);
            }
        }

        // Verificar disponibilidad para cada intervalo
        for (let minutos of intervalos) {
            const horaIntervalo = minutosAHora(minutos);
            const resultado = await verificarDisponibilidadConDuracion(
                fecha, horaIntervalo, manicuristaId, duracionServicio
            );

            if (resultado.disponible) {
                const diferencia = Math.abs(minutos - horaDeseadaMinutos);
                sugerencias.push({
                    hora: horaIntervalo,
                    diferencia: diferencia
                });
            }
        }

        // Ordenar por proximidad a la hora deseada
        sugerencias.sort((a, b) => a.diferencia - b.diferencia);
        
        // Devolver máximo 5 sugerencias
        return sugerencias.slice(0, 5);

    } catch (error) {
        console.error("❌ Error sugiriendo horarios:", error);
        return [];
    }
}

// ==========================
// Función para mostrar citas del cliente
// ==========================
async function mostrarCitasCliente(telefono, conversacion) {
    try {
        console.log("🔍 [mostrarCitasCliente] Iniciando para:", telefono);
        
        // Obtener el número de teléfono sin el formato de WhatsApp
        const telefonoLimpio = telefono.replace('@s.whatsapp.net', '');
        
        // Obtener todas las citas de Firebase
        const citasSnapshot = await get(ref(db, 'citas'));
        
        if (!citasSnapshot.exists()) {
            await enviarMensaje(telefono, "📅 No tienes citas agendadas aún.\n\n¿Te gustaría agendar una nueva cita? Escribe *A* para continuar.");
            conversacion.paso = 'menu_principal';
            return;
        }

        const todasLasCitas = citasSnapshot.val();
        
        // Filtrar citas del cliente específico
        const citasDelCliente = Object.entries(todasLasCitas)
            .filter(([id, cita]) => cita.clienteId === telefonoLimpio)
            .map(([id, cita]) => ({ id, ...cita }));

        if (citasDelCliente.length === 0) {
            await enviarMensaje(telefono, "📅 No tienes citas agendadas aún.\n\n¿Te gustaría agendar una nueva cita? Escribe *A* para continuar.");
            conversacion.paso = 'menu_principal';
            return;
        }

        // Separar citas por estado y ordenar por fecha
        const citasActivas = citasDelCliente
            .filter(cita => cita.estado !== 'Cancelada' && cita.estado !== 'Completada')
            .sort((a, b) => compararFechas(a.fecha, b.fecha));

        const citasHistoricas = citasDelCliente
            .filter(cita => cita.estado === 'Cancelada' || cita.estado === 'Completada')
            .sort((a, b) => compararFechas(b.fecha, a.fecha)); // Más recientes primero

        // Construir mensaje con las citas
        let mensaje = "📅 *TUS CITAS AGENDADAS*\n\n";

        if (citasActivas.length > 0) {
            mensaje += "🔹 *CITAS PRÓXIMAS:*\n";
            for (let i = 0; i < citasActivas.length; i++) {
                const cita = citasActivas[i];
                const servicioInfo = await obtenerInfoServicio(cita.servicioId);
                const estadoEmoji = obtenerEmojiEstado(cita.estado);
                
                mensaje += `\n${i + 1}. ${estadoEmoji} *${servicioInfo.nombre}*\n`;
                mensaje += `   📅 ${formatearFecha(cita.fecha)}\n`;
                mensaje += `   🕒 ${cita.hora}\n`;
                mensaje += `   👩‍🎨 ${cita.manicuristaId}\n`;
                mensaje += `   💰 $${servicioInfo.precio}\n`;
                mensaje += `   ⏱ ${servicioInfo.duracion} min\n`;
                if (cita.notas && cita.notas.trim()) {
                    mensaje += `   📝 ${cita.notas}\n`;
                }
                mensaje += `   🔑 ID: ${cita.id.substring(0, 8)}...\n`;
            }
        }

        if (citasHistoricas.length > 0) {
            mensaje += "\n🔹 *HISTORIAL (últimas 3):*\n";
            const citasRecientes = citasHistoricas.slice(0, 3);
            
            for (let cita of citasRecientes) {
                const servicioInfo = await obtenerInfoServicio(cita.servicioId);
                const estadoEmoji = obtenerEmojiEstado(cita.estado);
                
                mensaje += `\n• ${estadoEmoji} ${servicioInfo.nombre} - ${formatearFecha(cita.fecha)} ${cita.hora}\n`;
            }
        }

        // Opciones disponibles
        if (citasActivas.length > 0) {
            mensaje += "\n🔧 *OPCIONES:*\n";
            mensaje += "• Para CANCELAR una cita, escribe *C* + número:\n";
            citasActivas.forEach((cita, i) => {
                mensaje += `  - *C${i + 1}* para cancelar la cita del ${formatearFecha(cita.fecha)}\n`;
            });
            mensaje += "\n";
        }
        
        mensaje += "• Escribe *A* para agendar nueva cita\n";
        mensaje += "• Escribe *0* para volver al menú principal";

        console.log("📤 [mostrarCitasCliente] Enviando mensaje con citas para:", telefono);
        console.log("📤 [mostrarCitasCliente] Citas activas encontradas:", citasActivas.length);
        
        await enviarMensaje(telefono, mensaje);
        
        // Guardar las citas activas en la conversación para manejar acciones
        conversacion.datosTemporales = conversacion.datosTemporales || {};
        conversacion.datosTemporales.citasActivas = citasActivas;
        conversacion.paso = 'gestionar_citas';

        console.log("✅ [mostrarCitasCliente] Paso cambiado a: gestionar_citas");
        console.log("✅ [mostrarCitasCliente] Citas guardadas:", citasActivas.length);

    } catch (error) {
        console.error("❌ Error obteniendo citas del cliente:", error);
        await enviarMensaje(telefono, "❌ Ocurrió un error al obtener tus citas. Por favor, intenta de nuevo más tarde.");
        conversacion.paso = 'menu_principal';
    }
}



// ==========================
// Funciones auxiliares para mostrar citas
// ==========================

// Obtener información del servicio desde Firebase
async function obtenerInfoServicio(servicioId) {
    try {
        const serviciosSnapshot = await get(ref(db, 'servicios'));
        if (!serviciosSnapshot.exists()) {
            return { nombre: 'Servicio no encontrado', precio: '0', duracion: '60' };
        }

        const servicios = Object.values(serviciosSnapshot.val());
        const servicio = servicios.find(s => s.id === servicioId);
        
        return servicio || { nombre: 'Servicio no encontrado', precio: '0', duracion: '60' };
    } catch (error) {
        console.error("❌ Error obteniendo info del servicio:", error);
        return { nombre: 'Error al cargar', precio: '0', duracion: '60' };
    }
}

// Obtener emoji según el estado de la cita
function obtenerEmojiEstado(estado) {
    const emojis = {
        'Reservada': '✅',
        'Confirmada': '🔔',
        'En Proceso': '⏳',
        'Completada': '✨',
        'Cancelada': '❌'
    };
    return emojis[estado] || '📅';
}

// Formatear fecha para mostrar más amigable
function formatearFecha(fecha) {
    const [dia, mes, anio] = fecha.split('/');
    const fechaObj = new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia));
    
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const diaSemana = diasSemana[fechaObj.getDay()];
    const nombreMes = meses[fechaObj.getMonth()];
    
    return `${diaSemana} ${dia}/${mes} (${nombreMes})`;
}

// Comparar fechas en formato DD/MM/YYYY
function compararFechas(fecha1, fecha2) {
    const [dia1, mes1, anio1] = fecha1.split('/').map(Number);
    const [dia2, mes2, anio2] = fecha2.split('/').map(Number);
    
    const date1 = new Date(anio1, mes1 - 1, dia1);
    const date2 = new Date(anio2, mes2 - 1, dia2);
    
    return date1 - date2;
}

// ==========================
// Función para gestionar acciones sobre las citas
// ==========================
async function gestionarCitas(mensaje, telefono, conversacion) {
    const mensajeLower = mensaje.toLowerCase().trim();
    
    // Volver al menú principal
    if (mensajeLower === '0') {
        conversacion.paso = 'menu_principal';
        await procesarEstadoConversacion('', telefono, conversacion);
        return;
    }
    
    // Agendar nueva cita
    if (mensajeLower === '1') {
        await iniciarAgendamiento(telefono, conversacion);
        return;
    }
    
    // Cancelar cita (C1, C2, etc.)
    if (mensajeLower.startsWith('c') && mensajeLower.length > 1) {
        const numCita = parseInt(mensajeLower.substring(1)) - 1;
        await cancelarCita(numCita, telefono, conversacion);
        return;
    }
    
    // Reprogramar cita (R1, R2, etc.)
    if (mensajeLower.startsWith('r') && mensajeLower.length > 1) {
        const numCita = parseInt(mensajeLower.substring(1)) - 1;
        await reprogramarCita(numCita, telefono, conversacion);
        return;
    }
    
    // Opción no reconocida
    await enviarMensaje(telefono, "❌ Opción no válida. Por favor:\n" +
        "• Escribe *C* + número para cancelar (ej: C1)\n" +
        "• Escribe *R* + número para reprogramar (ej: R1)\n" +
        "• Escribe *1* para nueva cita\n" +
        "• Escribe *0* para menú principal");
}

// ==========================
// Funciones para cancelar y reprogramar citas
// ==========================

async function cancelarCita(indiceCita, telefono, conversacion) {
    const citasActivas = conversacion.datosTemporales.citasActivas || [];
    
    if (indiceCita < 0 || indiceCita >= citasActivas.length) {
        await enviarMensaje(telefono, "❌ Número de cita inválido. Por favor verifica el número correcto.");
        return;
    }
    
    const cita = citasActivas[indiceCita];
    
    try {
        // Actualizar estado de la cita a "Cancelada"
        await set(ref(db, `citas/${cita.id}/estado`), 'Cancelada');
        await set(ref(db, `citas/${cita.id}/fechaCancelacion`), new Date().toISOString());
        
        const servicioInfo = await obtenerInfoServicio(cita.servicioId);
        
        const mensaje = `✅ *Cita cancelada exitosamente*\n\n` +
                       `📅 Fecha: ${formatearFecha(cita.fecha)}\n` +
                       `🕒 Hora: ${cita.hora}\n` +
                       `💅 Servicio: ${servicioInfo.nombre}\n` +
                       `🔑 ID: ${cita.id.substring(0, 8)}...\n\n` +
                       `Si deseas agendar otra cita, escribe *1*`;
        
        await enviarMensaje(telefono, mensaje);
        
        // Notificar a la manicurista
        const manicuristaJid = MANICURISTAS[cita.manicuristaId];
        if (manicuristaJid) {
            const telefonoCliente = telefono.replace('@s.whatsapp.net', '');
            const clienteSnapshot = await get(ref(db, `clientes/${telefonoCliente}`));
            const nombreCliente = clienteSnapshot.exists() ? clienteSnapshot.val().nombre : 'Cliente';
            
            await enviarMensaje(manicuristaJid, 
                `❌ *Cita cancelada por el cliente*\n\n` +
                `👤 Cliente: ${nombreCliente}\n` +
                `📅 Fecha: ${formatearFecha(cita.fecha)}\n` +
                `🕒 Hora: ${cita.hora}\n` +
                `💅 Servicio: ${servicioInfo.nombre}\n` +
                `🔑 ID: ${cita.id.substring(0, 8)}...`
            );
        }
        
        conversacion.paso = 'menu_principal';
        
    } catch (error) {
        console.error("❌ Error cancelando cita:", error);
        await enviarMensaje(telefono, "❌ Error al cancelar la cita. Por favor, intenta de nuevo.");
    }
}

async function reprogramarCita(indiceCita, telefono, conversacion) {
    const citasActivas = conversacion.datosTemporales.citasActivas || [];
    
    if (indiceCita < 0 || indiceCita >= citasActivas.length) {
        await enviarMensaje(telefono, "❌ Número de cita inválido. Por favor verifica el número correcto.");
        return;
    }
    
    const cita = citasActivas[indiceCita];
    const servicioInfo = await obtenerInfoServicio(cita.servicioId);
    
    // Guardar datos de la cita a reprogramar
    conversacion.datosTemporales.citaAReprogramar = cita;
    conversacion.datosTemporales.servicioSeleccionado = servicioInfo;
    
    await enviarMensaje(telefono, 
        `🔄 *Reprogramando cita:*\n\n` +
        `💅 Servicio: ${servicioInfo.nombre}\n` +
        `📅 Fecha actual: ${formatearFecha(cita.fecha)}\n` +
        `🕒 Hora actual: ${cita.hora}\n\n` +
        `Por favor, indica la nueva fecha que deseas (formato DD/MM/AAAA):`
    );
    
    conversacion.paso = 'reprogramar_fecha';
}



// Funciones para manejar reprogramación
async function manejarReprogramarFecha(mensaje, telefono, conversacion) {
    const fecha = mensaje.trim();
    const regexFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;

    if (!regexFecha.test(fecha)) {
        await enviarMensaje(telefono, "❌ Formato de fecha inválido. Escribe la fecha en formato DD/MM/AAAA (ejemplo: 25/08/2025).");
        return;
    }

    if (!esFechaPermitida(fecha)) {
        await enviarMensaje(telefono, "❌ Solo puedes reprogramar citas para esta semana o la siguiente. Por favor, selecciona otra fecha.");
        return;
    }

    conversacion.datosTemporales.nuevaFecha = fecha;
    conversacion.paso = 'reprogramar_hora';
    
    await enviarMensaje(telefono, 
        `✅ Nueva fecha seleccionada: ${formatearFecha(fecha)}\n\n` +
        `Por favor, indica la nueva hora que deseas (ejemplo: 15:30):`
    );
}

