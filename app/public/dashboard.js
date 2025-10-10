// ==========================
// Variables globales
// ==========================
let currentDate = new Date();
let selectedDate = new Date();
let appointments = [];
let clientes = [];
let servicios = [];

// ==========================
// Inicialización
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    await loadBotStatus();
    await loadClientes();
    await loadServicios();
    await loadAppointments();
    
    // Actualizar estado del bot cada 10 segundos
    setInterval(loadBotStatus, 10000);
    
    // Actualizar citas cada 2 minutos
    setInterval(loadAppointments, 120000);
});

// ==========================
// Funciones para cargar datos del servidor
// ==========================
async function loadBotStatus() {
    try {
        const response = await fetch('/api/bot-status');
        const data = await response.json();
        
        // Actualizar estado del bot
        const statusElement = document.getElementById('bot-status');
        statusElement.textContent = data.isConnected ? '✅ Conectado' : '❌ Desconectado';
        statusElement.className = `status ${data.isConnected ? 'text-success' : 'text-danger'}`;
        
        // Actualizar estadísticas
        document.getElementById('chats-activos').textContent = data.chatsActivos;
        document.getElementById('mensajes-enviados').textContent = data.mensajesEnviados;
        document.getElementById('mensajes-recibidos').textContent = data.mensajesRecibidos;
        
        // Actualizar QR si existe
        const qrContainer = document.getElementById('qr-container');
        if (data.qrCode) {
            qrContainer.innerHTML = `<img src="${data.qrCode}" class="qr-img">`;
        } else if (data.isConnected) {
            qrContainer.innerHTML = '<p class="text-success">✅ Bot conectado</p>';
        } else {
            qrContainer.innerHTML = '<p class="text-muted">QR no generado</p>';
        }
    } catch (error) {
        console.error('Error cargando estado del bot:', error);
    }
}

async function loadAppointments() {
    try {
        const response = await fetch('/api/citas');
        const data = await response.json();
        
        appointments = data.map(apt => ({
            ...apt,
            date: parseDate(apt.fecha, apt.hora)
        }));
        
        console.log('Citas cargadas:', appointments.length);
        updateCalendarDisplay();
        updateAppointmentList();
    } catch (error) {
        console.error('Error cargando citas:', error);
    }
}

async function loadClientes() {
    try {
        const response = await fetch('/api/clientes');
        clientes = await response.json();
    } catch (error) {
        console.error('Error cargando clientes:', error);
    }
}

async function loadServicios() {
    try {
        const response = await fetch('/api/servicios');
        servicios = await response.json();
    } catch (error) {
        console.error('Error cargando servicios:', error);
    }
}

// ==========================
// Funciones de utilidad
// ==========================
function parseDate(fechaStr, horaStr) {
    const [dia, mes, anio] = fechaStr.split('/');
    const [hora, minuto] = horaStr.split(':');
    return new Date(parseInt(anio), parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(minuto));
}

function getStatusStyle(status) {
    const styles = {
        'Reservada': 'background: #fff3cd; color: #856404;',
        'Confirmada': 'background: #d4edda; color: #155724;',
        'En Proceso': 'background: #cce7ff; color: #004085;',
        'Finalizada': 'background: #d1ecf1; color: #0c5460;',
        'Cancelada': 'background: #f8d7da; color: #721c24;'
    };
    return styles[status] || 'background: #e2e3e5; color: #383d41;';
}

// ==========================
// Funciones del calendario
// ==========================
function updateCalendarDisplay() {
    const monthYear = document.getElementById('calendar-month-year');
    const calendarGrid = document.getElementById('calendar-grid');
    
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    monthYear.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    
    calendarGrid.innerHTML = '';
    
    // Días de la semana
    const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    dayHeaders.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day-header';
        dayElement.textContent = day;
        calendarGrid.appendChild(dayElement);
    });
    
    // Obtener el primer día del mes
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // Generar los días del calendario
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = date.getDate();
        dayElement.onclick = () => selectDate(date);
        
        if (date.getMonth() !== currentDate.getMonth()) {
            dayElement.classList.add('other-month');
        }
        
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        const hasAppointments = appointments.some(apt => 
            apt.date.toDateString() === date.toDateString()
        );
        if (hasAppointments) {
            dayElement.classList.add('has-appointments');
            const dot = document.createElement('div');
            dot.className = 'appointment-dot';
            dayElement.appendChild(dot);
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

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
    
    appointmentList.innerHTML = upcomingAppointments
        .map(apt => {
            const timeStr = apt.date.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const dateStr = apt.date.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            
            const hoursUntil = (apt.date.getTime() - today.getTime()) / (1000 * 60 * 60);
            const isUrgent = hoursUntil < 4 && hoursUntil > 0;
            
            const manicuristaInfo = apt.manicurista ? `💅 ${apt.manicurista}` : '';
            const precioInfo = apt.precio ? `💰 ${apt.precio}` : '';
            const duracionInfo = apt.duracion ? `⏱️ ${apt.duracion}min` : '';
            
            return `
                <div class="appointment-item ${isUrgent ? 'urgent' : ''}" onclick="showAppointmentDetails('${apt.id}')">
                    <div class="appointment-time">${timeStr} - ${dateStr}</div>
                    <div class="appointment-client">👤 ${apt.client}</div>
                    <div class="appointment-service">✂️ ${apt.service}</div>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <div class="appointment-status" style="${getStatusStyle(apt.status)}">${apt.status}</div>
                        <small class="text-muted">${duracionInfo} ${precioInfo}</small>
                    </div>
                    ${manicuristaInfo ? `<div class="text-muted"><small>${manicuristaInfo}</small></div>` : ''}
                </div>
            `;
        })
        .join('');
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    updateCalendarDisplay();
}

// ==========================
// Funciones de gestión de citas
// ==========================
function selectDate(date) {
    selectedDate = date;
    const dayAppointments = appointments.filter(apt => 
        apt.date.toDateString() === date.toDateString()
    );
    
    let existingAppointmentsHtml = '';
    if (dayAppointments.length > 0) {
        existingAppointmentsHtml = '<h6>Citas existentes:</h6>' + 
        dayAppointments
            .sort((a, b) => a.date - b.date)
            .map(apt => `
                <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #007bff;">${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</strong>
                        <span style="font-size: 0.8em; color: #666;">⏱️ ${apt.duracion || 60}min</span>
                    </div>
                    <div style="margin: 5px 0;"><strong>👤 ${apt.client}</strong></div>
                    <div style="margin: 5px 0;">📞 ${apt.telefono}</div>
                    <div style="margin: 5px 0;">✂️ ${apt.service}</div>
                    <div style="margin: 5px 0;">💅 ${apt.manicurista}</div>
                    ${apt.precio ? `<div style="margin: 5px 0;">💰 ${apt.precio}</div>` : ''}
                    <div style="margin: 5px 0; padding: 4px 8px; border-radius: 12px; display: inline-block; ${getStatusStyle(apt.status)}">${apt.status}</div>
                    ${apt.notas ? `<div style="margin: 5px 0; font-style: italic;">📝 ${apt.notas}</div>` : ''}
                    <div class="action-buttons" style="text-align: right;">
                        <button onclick="callClient('${apt.telefono}')" class="btn btn-sm btn-primary" style="margin: 2px;">📞 Llamar</button>
                        <button onclick="showStatusMenu('${apt.id}', '${apt.status}')" class="btn btn-sm btn-warning" style="margin: 2px;">🔄 Estado</button>
                        <button onclick="cancelAppointment('${apt.id}')" class="btn btn-sm btn-danger" style="margin: 2px;">❌ Cancelar</button>
                    </div>
                </div>
            `)
            .join('') + '<hr>';
    }
    
    const dateStr = date.toLocaleDateString('es-ES');
    
    Swal.fire({
        title: `📅 ${dateStr}`,
        html: `
            ${existingAppointmentsHtml}
            <div style="text-align: center; margin: 20px 0;">
                <button onclick="showNewAppointmentForm('${dateStr}')" class="btn btn-success">
                    ➕ Agregar Nueva Cita
                </button>
            </div>
        `,
        width: '600px',
        showConfirmButton: false,
        showCloseButton: true
    });
}

function showStatusMenu(appointmentId, currentStatus) {
    const estados = [
        { valor: 'Reservada', icono: '📅', descripcion: 'Cita reservada', color: '#856404' },
        { valor: 'Confirmada', icono: '✅', descripcion: 'Cliente confirmó asistencia', color: '#155724' },
        { valor: 'En Proceso', icono: '⏳', descripcion: 'Servicio en progreso', color: '#004085' },
        { valor: 'Finalizada', icono: '🎉', descripcion: 'Servicio completado', color: '#0c5460' },
        { valor: 'Cancelada', icono: '❌', descripcion: 'Cita cancelada', color: '#721c24' }
    ];
    
    const estadosHtml = estados
        .filter(estado => estado.valor !== currentStatus)
        .map(estado => `
            <button onclick="changeAppointmentStatus('${appointmentId}', '${estado.valor}')" 
                    class="btn btn-outline-primary w-100 mb-2" 
                    style="text-align: left; display: flex; align-items: center;">
                <span style="margin-right: 10px; font-size: 1.2em;">${estado.icono}</span>
                <div>
                    <strong>${estado.valor}</strong><br>
                    <small style="color: #666;">${estado.descripcion}</small>
                </div>
            </button>
        `)
        .join('');
    
    Swal.fire({
        title: `🔄 Cambiar Estado`,
        html: `
            <div style="text-align: left; margin-bottom: 15px;">
                <strong>Estado actual:</strong> 
                <span style="padding: 4px 12px; border-radius: 15px; font-weight: bold; ${getStatusStyle(currentStatus)}">${currentStatus}</span>
            </div>
            <div style="text-align: center;">
                ${estadosHtml}
            </div>
        `,
        width: '400px',
        showConfirmButton: false,
        showCloseButton: true
    });
}

async function changeAppointmentStatus(appointmentId, newStatus) {
    let confirmMessage = '';
    let confirmIcon = 'question';
    
    switch(newStatus) {
        case 'Finalizada':
            confirmMessage = '¿Confirmar que el servicio ha sido finalizado?';
            confirmIcon = 'success';
            break;
        case 'Cancelada':
            confirmMessage = '¿Estás seguro de que quieres cancelar esta cita?';
            confirmIcon = 'warning';
            break;
        case 'En Proceso':
            confirmMessage = '¿Marcar el servicio como en proceso?';
            confirmIcon = 'info';
            break;
        default:
            confirmMessage = `¿Cambiar el estado a ${newStatus}?`;
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
            const response = await fetch(`/api/citas/${appointmentId}/estado`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: newStatus })
            });
            
            const result = await response.json();
            
            if (result.success) {
                let successMessage = 'Estado actualizado correctamente';
                let successIcon = 'success';
                
                if (newStatus === 'Finalizada') {
                    successMessage = '🎉 ¡Servicio finalizado exitosamente!';
                } else if (newStatus === 'En Proceso') {
                    successMessage = '⏳ Servicio marcado como en proceso';
                }
                
                Swal.fire({
                    icon: successIcon,
                    title: successMessage,
                    timer: 2000,
                    showConfirmButton: false
                });
                
                await loadAppointments();
            } else {
                throw new Error(result.error || 'Error desconocido');
            }
        } catch (error) {
            console.error('Error cambiando estado:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo cambiar el estado: ' + error.message
            });
        }
    }
}

function showNewAppointmentForm(dateStr) {
    const clientesOptions = clientes.map(cliente => 
        `<option value="${cliente.id}">${cliente.nombre} (${cliente.telefono})</option>`
    ).join('');
    
    const serviciosOptions = servicios.map(servicio => 
        `<option value="${servicio.id}">${servicio.nombre} - ${servicio.precio} (${servicio.duracion}min)</option>`
    ).join('');
    
    const horasOptions = [];
    for (let hora = 8; hora <= 22; hora++) {
        for (let minuto = 0; minuto < 60; minuto += 30) {
            const horaStr = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;
            horasOptions.push(`<option value="${horaStr}">${horaStr}</option>`);
        }
    }
    
    Swal.fire({
        title: `➕ Nueva Cita - ${dateStr}`,
        html: `
            <div class="new-appointment-form">
                <div class="form-group">
                    <label for="cliente">Cliente:</label>
                    <select id="cliente" required>
                        <option value="">Seleccionar cliente...</option>
                        ${clientesOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="servicio">Servicio:</label>
                    <select id="servicio" required>
                        <option value="">Seleccionar servicio...</option>
                        ${serviciosOptions}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="hora">Hora:</label>
                    <select id="hora" required>
                        <option value="">Seleccionar hora...</option>
                        ${horasOptions.join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="manicurista">Manicurista:</label>
                    <input type="text" id="manicurista" placeholder="Nombre del manicurista (opcional)">
                </div>
                
                <div class="form-group">
                    <label for="notas">Notas:</label>
                    <textarea id="notas" rows="3" placeholder="Notas adicionales (opcional)"></textarea>
                </div>
            </div>
        `,
        width: '500px',
        showCancelButton: true,
        confirmButtonText: '💾 Crear Cita',
        cancelButtonText: '❌ Cancelar',
        preConfirm: () => {
            const clienteId = document.getElementById('cliente').value;
            const servicioId = document.getElementById('servicio').value;
            const hora = document.getElementById('hora').value;
            const manicurista = document.getElementById('manicurista').value;
            const notas = document.getElementById('notas').value;
            
            if (!clienteId || !servicioId || !hora) {
                Swal.showValidationMessage('Por favor completa todos los campos obligatorios');
                return false;
            }
            
            return {
                clienteId,
                servicioId,
                fecha: dateStr,
                hora,
                manicuristaId: manicurista || 'Sin asignar',
                notas
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await createNewAppointment(result.value);
        }
    });
}

async function createNewAppointment(appointmentData) {
    try {
        const response = await fetch('/api/citas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(appointmentData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Cita creada!',
                text: 'La cita se ha creado exitosamente',
                timer: 2000,
                showConfirmButton: false
            });
            
            await loadAppointments();
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error creando cita:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo crear la cita: ' + error.message
        });
    }
}

function showAppointmentDetails(appointmentId) {
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) return;
    
    const detailsHtml = `
        <div style="text-align: left;">
            <p><strong>📅 Fecha:</strong> ${apt.date.toLocaleDateString('es-ES')}</p>
            <p><strong>🕐 Hora:</strong> ${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</p>
            <p><strong>👤 Cliente:</strong> ${apt.client}</p>
            <p><strong>📞 Teléfono:</strong> ${apt.telefono}</p>
            <p><strong>✂️ Servicio:</strong> ${apt.service}</p>
            <p><strong>💅 Manicurista:</strong> ${apt.manicurista}</p>
            <p><strong>⏱️ Duración:</strong> ${apt.duracion || 60} minutos</p>
            ${apt.precio ? `<p><strong>💰 Precio:</strong> ${apt.precio}</p>` : ''}
            <p><strong>📊 Estado:</strong> <span style="padding: 4px 8px; border-radius: 12px; ${getStatusStyle(apt.status)}">${apt.status}</span></p>
            ${apt.notas ? `<p><strong>📝 Notas:</strong> ${apt.notas}</p>` : ''}
        </div>
    `;
    
    Swal.fire({
        title: 'Detalles de la Cita',
        html: detailsHtml,
        showCancelButton: true,
        confirmButtonText: '📞 Llamar Cliente',
        cancelButtonText: '🔄 Cambiar Estado',
        showCloseButton: true,
        footer: '<button onclick="cancelAppointment(\'' + apt.id + '\')" class="btn btn-sm btn-danger">❌ Cancelar Cita</button>'
    }).then((result) => {
        if (result.isConfirmed) {
            callClient(apt.telefono);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            showStatusMenu(apt.id, apt.status);
        }
    });
}

function callClient(telefono) {
    window.open(`tel:${telefono}`, '_self');
}

async function cancelAppointment(appointmentId) {
    const result = await Swal.fire({
        title: '¿Cancelar cita?',
        text: 'Esta acción no se puede deshacer',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No cancelar'
    });
    
    if (result.isConfirmed) {
        try {
            const response = await fetch(`/api/citas/${appointmentId}/cancelar`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Cita cancelada',
                    text: 'La cita se ha cancelado correctamente',
                    timer: 2000,
                    showConfirmButton: false
                });
                
                await loadAppointments();
            } else {
                throw new Error(result.error || 'Error desconocido');
            }
        } catch (error) {
            console.error('Error cancelando cita:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo cancelar la cita: ' + error.message
            });
        }
    }
}

// ==========================
// Funciones de control del servidor
// ==========================
function reconectarBot() { 
    fetch('/reiniciar'); 
    Swal.fire('Reconectando...', '', 'info'); 
}

function reiniciarServidor() { 
    fetch('/reiniciar'); 
    Swal.fire('Servidor reiniciado', '', 'success'); 
}