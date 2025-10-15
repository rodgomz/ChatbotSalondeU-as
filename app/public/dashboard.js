// ============================================
// VARIABLES GLOBALES
// ============================================
let currentDate = new Date();
let selectedDate = new Date();
let currentWeekStart = getMonday(new Date());
let appointments = [];
let clientes = [];
let servicios = [];
 let deudas = [];
        let notificacionesPendientes = [];

        
const BUSINESS_HOURS = {
    start: 8,
    end: 22,
    interval: 30  // 30 minutos = 2 slots por hora
};

const MAX_APPOINTMENTS_PER_HOUR = 1; // Solo una manicurista
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TOTAL_HOURS_PER_WEEK = 14 * 7; // 8am a 10pm = 14 horas × 7 días = 98 horas

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadBotStatus();
    await loadClientes();
    await loadServicios();
    await loadAppointments();
    
    renderWeek();
    updateCalendarDisplay();
    updateAppointmentList();
    inicializarDeudas();
    verificarNotificaciones();
    setInterval(loadBotStatus, 10000);
    setInterval(loadAppointments, 120000);
      // Verificar notificaciones cada hora
            setInterval(verificarNotificaciones, 3600000);
            
            // Cerrar dropdown al hacer click fuera
            document.addEventListener('click', (e) => {
                const profileMenu = document.getElementById('profile-dropdown');
                const profileIcon = document.getElementById('profile-icon');
                if (!profileMenu.contains(e.target) && !profileIcon.contains(e.target)) {
                    profileMenu.classList.remove('show');
                }
            });
});

// ============================================
// FUNCIONES DE CARGA
// ============================================
async function loadBotStatus() {
    try {
        const response = await fetch('/api/bot-status');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const statusElement = document.getElementById('bot-status');
        statusElement.textContent = data.isConnected ? '✅ Conectado' : '❌ Desconectado';
        statusElement.className = `status ${data.isConnected ? 'text-success' : 'text-danger'}`;
        
        document.getElementById('chats-activos').textContent = data.chatsActivos || 0;
        document.getElementById('mensajes-enviados').textContent = data.mensajesEnviados || 0;
        document.getElementById('mensajes-recibidos').textContent = data.mensajesRecibidos || 0;
        
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
        document.getElementById('bot-status').textContent = '⚠️ Sin conexión';
        document.getElementById('bot-status').className = 'status text-warning';
    }
}

async function loadAppointments() {
    try {
        const response = await fetch('/api/citas');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        appointments = data.map(apt => {
            const fecha = parseDate(apt.fecha, apt.hora);
            // Usar duracion del servicio retornado en la cita
            const duracion = apt.duracion || 60;
            
            return {
                ...apt,
                date: fecha,
                duracion: duracion,
                endTime: new Date(fecha.getTime() + duracion * 60000) // Calcular hora de fin basado en duracion real
            };
        });

        console.log('Citas cargadas:', appointments.length);
        console.log('Duraciones:', appointments.map(a => `${a.client}: ${a.duracion}min`));
        renderWeek();
        updateCalendarDisplay();
        updateAppointmentList();
    } catch (error) {
        console.error('Error cargando citas:', error);
        appointments = [];
    }
}

async function loadClientes() {
    try {
        const response = await fetch('/api/clientes');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        clientes = await response.json();
    } catch (error) {
        console.error('Error cargando clientes:', error);
        clientes = [];
    }
}

async function loadServicios() {
    try {
        const response = await fetch('/api/servicios');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        servicios = await response.json();
    } catch (error) {
        console.error('Error cargando servicios:', error);
        servicios = [];
    }
}

function parseDate(fechaStr, horaStr) {
    try {
        const [dia, mes, anio] = fechaStr.split('/').map(num => parseInt(num, 10));
        const [hora, minuto] = horaStr.split(':').map(num => parseInt(num, 10));
        
        if (isNaN(dia) || isNaN(mes) || isNaN(anio) || isNaN(hora) || isNaN(minuto)) {
            console.error('Fecha inválida:', fechaStr, horaStr);
            return new Date();
        }
        
        const fecha = new Date(anio, mes - 1, dia, hora, minuto, 0);
        return fecha;
    } catch (error) {
        console.error('Error parseando fecha:', error);
        return new Date();
    }
}

// ============================================
// FUNCIONES DE DISPONIBILIDAD SEMANAL
// ============================================
function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// Obtener todas las citas que ocupan un horario específico
function getAppointmentsForSlot(date, hour, minute = 0) {
    const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0);
    const slotEnd = new Date(slotStart.getTime() + BUSINESS_HOURS.interval * 60000);
    
    return appointments.filter(apt => {
        // Solo contar citas confirmadas o en proceso (no canceladas)
        if (!['Reservada', 'Confirmada', 'En Proceso', 'Finalizada'].includes(apt.status)) {
            return false;
        }
        
        const aptStart = apt.date;
        const aptEnd = apt.endTime; // Usa la hora de fin calculada por duracion
        
        // Verificar si hay superposición de tiempo
        // Si la cita ocupa este slot, no está disponible
        return !(aptEnd <= slotStart || aptStart >= slotEnd);
    });
}

// Calcular horas ocupadas considerando la duración real del servicio
function getHoursOccupiedInDay(date) {
    let minutosOcupados = 0;
    
    const citasDelDia = appointments.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getFullYear() === date.getFullYear() &&
               aptDate.getMonth() === date.getMonth() &&
               aptDate.getDate() === date.getDate() &&
               ['Reservada', 'Confirmada', 'En Proceso', 'Finalizada'].includes(apt.status);
    });
    
    citasDelDia.forEach(apt => {
        minutosOcupados += apt.duracion; // Usar duración real del servicio
    });
    
    // Convertir minutos a horas (cada 60 minutos = 1 hora)
    return Math.ceil(minutosOcupados / 60);
}

// Calcular horas disponibles en un día
function getHoursAvailableInDay(date) {
    const HOURS_PER_DAY = BUSINESS_HOURS.end - BUSINESS_HOURS.start; // 14 horas
    const occupied = getHoursOccupiedInDay(date);
    return Math.max(0, HOURS_PER_DAY - occupied);
}

function renderWeek() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    document.getElementById('week-range').textContent =
        `${currentWeekStart.toLocaleDateString('es-ES', {day: 'numeric', month: 'short'})} - ${weekEnd.toLocaleDateString('es-ES', {day: 'numeric', month: 'short', year: 'numeric'})}`;

    const grid = document.getElementById('availability-grid');
    grid.innerHTML = '';

    let totalAvailable = 0;
    let totalBooked = 0;
    let totalAppointments = 0;

    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);

        const dayCard = createDayCard(date);
        const { available, booked, appointments: dayAppointments } = dayCard.stats;

        totalAvailable += available;
        totalBooked += booked;
        totalAppointments += dayAppointments;

        grid.appendChild(dayCard.element);
    }

    const totalSlots = totalAvailable + totalBooked;
    const occupancy = totalSlots > 0 ? Math.round((totalBooked / totalSlots) * 100) : 0;

    console.log(`📊 Resumen Semanal - Disponibles: ${totalAvailable}h, Agendadas: ${totalBooked}h, Total: ${totalSlots}h, Ocupación: ${occupancy}%`);

    document.getElementById('stat-available').textContent = totalAvailable;
    document.getElementById('stat-booked').textContent = totalBooked;
    document.getElementById('stat-occupancy').textContent = occupancy + '%';
    document.getElementById('stat-appointments').textContent = totalAppointments;
}

function createDayCard(date) {
    const dayOfWeek = DAYS[date.getDay()];
    const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    const HOURS_PER_DAY = BUSINESS_HOURS.end - BUSINESS_HOURS.start; // 14 horas
    const hoursOccupied = getHoursOccupiedInDay(date);
    const hoursAvailable = Math.max(0, HOURS_PER_DAY - hoursOccupied);

    const hoursHtml = [];

    for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
        for (let minute = 0; minute < 60; minute += BUSINESS_HOURS.interval) {
            const aptsInSlot = getAppointmentsForSlot(date, hour, minute);
            const isAvailable = aptsInSlot.length === 0;

            let slotClass = 'hour-slot';

            if (isAvailable) {
                slotClass += ' available';
            } else {
                slotClass += ' fully-booked';
            }

            const hourStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const capacity = `${aptsInSlot.length}/1`;

            hoursHtml.push(`
                <div class="${slotClass}" onclick="handleHourClick('${date.toISOString().split('T')[0]}', ${hour}, ${minute})">
                    <div class="hour-time">${hourStr}</div>
                    <div class="hour-availability">
                        <span class="availability-text">${capacity}</span>
                    </div>
                </div>
            `);
        }
    }

    const isToday = date.toDateString() === new Date().toDateString();

    const dayCardHtml = `
        <div class="day-card">
            <div class="day-header" style="${isToday ? 'background: linear-gradient(135deg, #28a745 0%, #20c997 100%);' : ''}">
                <h3>${dayOfWeek} ${isToday ? '(Hoy)' : ''}</h3>
                <p>${dateStr}</p>
            </div>
            <div class="day-status status-open">08:00 - 22:00 | ${hoursAvailable}h disponibles</div>
            <div class="hours-container">${hoursHtml.join('')}</div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = dayCardHtml;

    return {
        element: tempDiv.firstElementChild,
        stats: {
            available: hoursAvailable,
            booked: hoursOccupied,
            appointments: Object.values(appointments).filter(apt => 
                apt.date.toDateString() === date.toDateString()
            ).length
        }
    };
}

function previousWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderWeek();
}

function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderWeek();
}

function handleHourClick(dateStr, hour, minute = 0) {
    const date = new Date(dateStr);
    const aptsInSlot = getAppointmentsForSlot(date, hour, minute);
    const isAvailable = aptsInSlot.length === 0;
    
    // Si hay citas en este horario, mostrar detalles de la cita
    if (!isAvailable) {
        if (aptsInSlot.length === 1) {
            // Si solo hay una cita, mostrar directamente sus detalles
            showAppointmentDetails(aptsInSlot[0].id);
        } else {
            // Si hay múltiples citas, mostrar lista para seleccionar
            const citasHtml = aptsInSlot.map(apt => `
                <div style="background: #f8f9fa; padding: 10px; margin-bottom: 10px; border-radius: 6px; cursor: pointer;" onclick="showAppointmentDetails('${apt.id}')">
                    <div><strong>👤 ${apt.client}</strong></div>
                    <div>✂️ ${apt.service} (${apt.duracion}min)</div>
                    <div style="font-size: 0.85rem; color: #666;">📊 ${apt.status}</div>
                </div>
            `).join('');
            
            Swal.fire({
                title: `📋 Citas en este horario`,
                html: citasHtml,
                width: '500px',
                showConfirmButton: false,
                showCloseButton: true
            });
        }
        return;
    }
    
    // Si el horario está disponible, mostrar opción de agregar cita
    const hourStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const dateFormatted = date.toLocaleDateString('es-ES');
    
    Swal.fire({
        title: `📅 ${dateFormatted} - ${hourStr}`,
        html: `
            <div style="text-align: center; padding: 15px; background: #d4edda; border-radius: 8px;">
                <p style="margin-bottom: 10px;">
                    ✅ <strong>Disponible</strong>
                </p>
                <button onclick="showNewAppointmentForm('${dateStr}', '${hourStr}')" 
                        class="btn btn-success">
                    ➕ Agregar Nueva Cita
                </button>
            </div>
        `,
        width: '600px',
        showConfirmButton: false,
        showCloseButton: true
    });
}

// ============================================
// FUNCIONES DE CALENDARIO
// ============================================
function updateCalendarDisplay() {
    const monthYear = document.getElementById('calendar-month-year');
    const calendarGrid = document.getElementById('calendar-grid');
    
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    monthYear.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    
    calendarGrid.innerHTML = '';
    
    const dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    dayHeaders.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day-header';
        dayElement.textContent = day;
        calendarGrid.appendChild(dayElement);
    });
    
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
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
    today.setHours(0, 0, 0, 0);
    const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const upcomingAppointments = appointments
        .filter(apt => {
            const aptDate = new Date(apt.date);
            aptDate.setHours(0, 0, 0, 0);
            return aptDate >= today && aptDate <= nextTwoWeeks && 
                   ['Reservada', 'Confirmada', 'En Proceso'].includes(apt.status);
        })
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
            
            return `
                <div class="appointment-item" onclick="showAppointmentDetails('${apt.id}')">
                    <div class="appointment-time">${timeStr} - ${dateStr}</div>
                    <div class="appointment-client">👤 ${apt.client}</div>
                    <div class="appointment-service">✂️ ${apt.service}</div>
                </div>
            `;
        })
        .join('');
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    updateCalendarDisplay();
}

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
                        <strong style="color: #007bff;">${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})} - ${apt.endTime.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</strong>
                        <span style="font-size: 0.8em; color: #666;">⏱️ ${apt.duracion}min</span>
                    </div>
                    <div style="margin: 5px 0;"><strong>👤 ${apt.client}</strong></div>
                    <div style="margin: 5px 0;">📞 ${apt.telefono}</div>
                    <div style="margin: 5px 0;">✂️ ${apt.service}</div>
                    <div style="margin: 5px 0;">💅 ${apt.manicurista}</div>
                    ${apt.precio ? `<div style="margin: 5px 0;">💰 ${apt.precio}</div>` : ''}
                    <div style="margin: 5px 0; padding: 4px 8px; border-radius: 12px; display: inline-block;">${apt.status}</div>
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
                <button onclick="showNewAppointmentForm('${date.toISOString().split('T')[0]}')" class="btn btn-success">
                    ➕ Agregar Nueva Cita
                </button>
            </div>
        `,
        width: '600px',
        showConfirmButton: false,
        showCloseButton: true
    });
}

// ============================================
// FORMULARIO DE NUEVAS CITAS
// ============================================
function showNewAppointmentForm(dateStr, defaultHour = '') {
    let fecha = new Date(dateStr);
    if (isNaN(fecha.getTime())) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            fecha = new Date(parts[0], parts[1] - 1, parts[2]);
        }
    }
    
    const fechaFormateada = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
    
    const clientesOptions = clientes.map(cliente => 
        `<option value="${cliente.id}">${cliente.nombre} (${cliente.telefono})</option>`
    ).join('');

    const serviciosOptions = servicios.map(servicio => 
        `<option value="${servicio.id}">${servicio.nombre} - ${servicio.precio} (${servicio.duracion}min)</option>`
    ).join('');

    const horasOptions = [];
    for (let hora = BUSINESS_HOURS.start; hora < BUSINESS_HOURS.end; hora++) {
        for (let minuto = 0; minuto < 60; minuto += BUSINESS_HOURS.interval) {
            const horaStr = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;
            const selected = defaultHour === horaStr ? 'selected' : '';
            horasOptions.push(`<option value="${horaStr}" ${selected}>${horaStr}</option>`);
        }
    }

    Swal.fire({
        title: `➕ Nueva Cita - ${fecha.toLocaleDateString('es-ES')}`,
        html: `
            <div class="new-appointment-form" style="text-align: left;">
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="cliente" style="display: block; margin-bottom: 5px; font-weight: bold;">Cliente:</label>
                    <div style="display: flex; gap: 5px;">
                        <select id="cliente" class="form-control" required style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="">Seleccionar cliente...</option>
                            ${clientesOptions}
                        </select>
                        <button type="button" onclick="agregarClienteRapido()" class="btn btn-sm btn-info" style="white-space: nowrap;">➕ Nuevo</button>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="servicio" style="display: block; margin-bottom: 5px; font-weight: bold;">Servicio:</label>
                    <div style="display: flex; gap: 5px;">
                        <select id="servicio" class="form-control" required style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="">Seleccionar servicio...</option>
                            ${serviciosOptions}
                        </select>
                        <button type="button" onclick="agregarServicioRapido()" class="btn btn-sm btn-info" style="white-space: nowrap;">➕ Nuevo</button>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="hora" style="display: block; margin-bottom: 5px; font-weight: bold;">Hora:</label>
                    <select id="hora" class="form-control" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                        <option value="">Seleccionar hora...</option>
                        ${horasOptions.join('')}
                    </select>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="manicurista" style="display: block; margin-bottom: 5px; font-weight: bold;">Manicurista:</label>
                    <input type="text" id="manicurista" class="form-control" placeholder="Nombre del manicurista (opcional)" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                
                <div class="form-group">
                    <label for="notas" style="display: block; margin-bottom: 5px; font-weight: bold;">Notas:</label>
                    <textarea id="notas" class="form-control" rows="3" placeholder="Notas adicionales (opcional)" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;"></textarea>
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
                fecha: fechaFormateada,
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

// Función para agregar cliente rápidamente
function agregarClienteRapido() {
    Swal.fire({
        title: '➕ Agregar Nuevo Cliente',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nombre:</label>
                    <input type="text" id="nombre-cliente" class="form-control" placeholder="Nombre del cliente" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Teléfono:</label>
                    <input type="tel" id="telefono-cliente" class="form-control" placeholder="Número de teléfono" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
            </div>
        `,
        width: '400px',
        showCancelButton: true,
        confirmButtonText: '✅ Guardar Cliente',
        cancelButtonText: '❌ Cancelar',
        preConfirm: async () => {
            const nombre = document.getElementById('nombre-cliente').value;
            const telefono = document.getElementById('telefono-cliente').value;

            if (!nombre || !telefono) {
                Swal.showValidationMessage('Por favor completa todos los campos');
                return false;
            }

            try {
                const response = await fetch('/api/clientes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, telefono })
                });

                const result = await response.json();
                if (result.success) {
                    // Recargar clientes
                    await loadClientes();
                    Swal.fire('Éxito', 'Cliente agregado correctamente', 'success');
                    return { nombre, telefono };
                } else {
                    throw new Error(result.error || 'Error desconocido');
                }
            } catch (error) {
                Swal.showValidationMessage('Error: ' + error.message);
                return false;
            }
        }
    });
}

// Función para agregar servicio rápidamente
function agregarServicioRapido() {
    Swal.fire({
        title: '➕ Agregar Nuevo Servicio',
        html: `
            <div style="text-align: left;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nombre:</label>
                    <input type="text" id="nombre-servicio" class="form-control" placeholder="Nombre del servicio" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Precio ($):</label>
                    <input type="number" id="precio-servicio" class="form-control" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Duración (minutos):</label>
                    <input type="number" id="duracion-servicio" class="form-control" placeholder="60" min="15" step="15" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
            </div>
        `,
        width: '400px',
        showCancelButton: true,
        confirmButtonText: '✅ Guardar Servicio',
        cancelButtonText: '❌ Cancelar',
        preConfirm: async () => {
            const nombre = document.getElementById('nombre-servicio').value;
            const precio = document.getElementById('precio-servicio').value;
            const duracion = document.getElementById('duracion-servicio').value;

            if (!nombre || !precio || !duracion) {
                Swal.showValidationMessage('Por favor completa todos los campos');
                return false;
            }

            try {
                const response = await fetch('/api/servicios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, precio: parseFloat(precio), duracion: parseInt(duracion) })
                });

                const result = await response.json();
                if (result.success) {
                    // Recargar servicios
                    await loadServicios();
                    Swal.fire('Éxito', 'Servicio agregado correctamente', 'success');
                    return { nombre, precio, duracion };
                } else {
                    throw new Error(result.error || 'Error desconocido');
                }
            } catch (error) {
                Swal.showValidationMessage('Error: ' + error.message);
                return false;
            }
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
                title: '✅ Cita creada',
                text: 'La cita se ha creado exitosamente',
                timer: 2000,
                showConfirmButton: false
            });
            
            await loadAppointments();
            // Recargar también formulario en caso de que se agregaron clientes/servicios
            await showNewAppointmentForm('');
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
    if (!apt) {
        Swal.fire('Error', 'Cita no encontrada', 'error');
        return;
    }

    const estados = ['Reservada', 'Confirmada', 'En Proceso', 'Finalizada', 'Cancelada'];
    const estadosOptions = estados.map(estado => 
        `<option value="${estado}" ${apt.status === estado ? 'selected' : ''}>${estado}</option>`
    ).join('');

    const detailsHtml = `
        <div style="text-align: left; padding: 10px;">
            <div style="background: #f8f9ff; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>📅 Fecha:</strong> ${apt.date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p style="margin: 8px 0;"><strong>🕐 Hora:</strong> ${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})} - ${apt.endTime.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</p>
            </div>
            
            <div style="background: white; padding: 15px; border: 1px solid #e1e5f7; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>👤 Cliente:</strong> ${apt.client}</p>
                <p style="margin: 8px 0;"><strong>📞 Teléfono:</strong> ${apt.telefono}</p>
            </div>
            
            <div style="background: white; padding: 15px; border: 1px solid #e1e5f7; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>✂️ Servicio:</strong> ${apt.service}</p>
                <p style="margin: 8px 0;"><strong>💅 Manicurista:</strong> ${apt.manicurista}</p>
                <p style="margin: 8px 0;"><strong>⏱️ Duración:</strong> ${apt.duracion} minutos</p>
                ${apt.precio ? `<p style="margin: 8px 0;"><strong>💰 Precio:</strong> ${apt.precio}</p>` : ''}
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px;"><strong>📊 Estado:</strong></label>
                <select id="estado-cita" class="form-control" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                    ${estadosOptions}
                </select>
            </div>
            
            ${apt.notas ? `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 0;"><strong>📝 Notas:</strong></p>
                    <p style="margin: 5px 0 0 0; color: #666;">${apt.notas}</p>
                </div>
            ` : ''}
        </div>
    `;

    Swal.fire({
        title: '📋 Detalles de la Cita',
        html: detailsHtml,
        width: '600px',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '💾 Guardar Estado',
        denyButtonText: '🗑️ Cancelar Cita',
        cancelButtonText: '❌ Cerrar',
        confirmButtonColor: '#28a745',
        denyButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        preConfirm: async () => {
            const nuevoEstado = document.getElementById('estado-cita').value;
            if (nuevoEstado !== apt.status) {
                return { action: 'update', estado: nuevoEstado };
            }
            return null;
        },
        preDeny: () => {
            return { action: 'delete' };
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            if (result.value.action === 'update') {
                await updateAppointmentStatus(appointmentId, result.value.estado);
            }
        } else if (result.isDenied) {
            Swal.fire({
                title: '¿Estás seguro?',
                text: "Esta acción no se puede deshacer",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Sí, cancelar',
                cancelButtonText: 'No'
            }).then(async (confirmResult) => {
                if (confirmResult.isConfirmed) {
                    await deleteAppointment(appointmentId);
                }
            });
        }
    });
}

async function updateAppointmentStatus(appointmentId, newStatus) {
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
            Swal.fire({
                icon: 'success',
                title: '✅ Estado Actualizado',
                text: `La cita ahora está en estado: ${newStatus}`,
                timer: 2000,
                showConfirmButton: false
            });
            await loadAppointments();
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error actualizando estado:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo actualizar el estado: ' + error.message
        });
    }
}

async function deleteAppointment(appointmentId) {
    try {
        const response = await fetch(`/api/citas/${appointmentId}/estado`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: 'Cancelada' })
        });

        const result = await response.json();

        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: '✅ Cita Cancelada',
                text: 'La cita ha sido cancelada exitosamente',
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

  // ============================================
        // FUNCIONES DE PERFIL
        // ============================================
        function toggleProfileMenu() {
            const dropdown = document.getElementById('profile-dropdown');
            dropdown.classList.toggle('show');
        }

        function irADeudas() {
            document.getElementById('deudas-page').style.display = 'block';
            document.body.style.overflow = 'hidden';
            cargarDeudas();
            toggleProfileMenu();
        }

        function cerrarDeudas() {
            document.getElementById('deudas-page').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function verNotificaciones() {
            if (notificacionesPendientes.length === 0) {
                Swal.fire({
                    icon: 'info',
                    title: 'Sin notificaciones',
                    text: 'No tienes notificaciones pendientes'
                });
            } else {
                const html = notificacionesPendientes.map(n => `
                    <div style="text-align: left; padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${n.urgente ? '#dc3545' : '#ffc107'};">
                        <h6 style="margin: 0 0 5px; color: #333;">${n.titulo}</h6>
                        <p style="margin: 0; color: #666; font-size: 0.9rem;">${n.mensaje}</p>
                    </div>
                `).join('');
                
                Swal.fire({
                    title: '🔔 Notificaciones',
                    html: html,
                    width: '600px',
                    confirmButtonText: 'Cerrar'
                });
            }
            toggleProfileMenu();
        }

        function configuracion() {
            Swal.fire({
                title: '⚙️ Configuración',
                html: '<p>Panel de configuración en desarrollo...</p>',
                confirmButtonText: 'Cerrar'
            });
            toggleProfileMenu();
        }

        function cerrarSesion() {
            Swal.fire({
                title: '¿Cerrar sesión?',
                text: '¿Estás seguro de que quieres cerrar sesión?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, cerrar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Aquí implementa tu lógica de cierre de sesión
                    window.location.href = '/login';
                }
            });
            toggleProfileMenu();
        }

        // ============================================
        // FUNCIONES DE DEUDAS
        // ============================================
        function inicializarDeudas() {
            deudasRef.on('value', (snapshot) => {
                deudas = [];
                snapshot.forEach((childSnapshot) => {
                    deudas.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
                
                if (document.getElementById('deudas-page').style.display !== 'none') {
                    renderizarDeudas();
                }
                
                verificarNotificaciones();
            });
        }

        function cargarDeudas() {
            renderizarDeudas();
        }

        function renderizarDeudas() {
            const grid = document.getElementById('deudas-grid');
            
            if (deudas.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">💳</div>
                        <h3 style="color: #333; margin-bottom: 10px;">No hay pagos registrados</h3>
                        <p style="color: #666; margin-bottom: 20px;">Comienza agregando tus compromisos financieros</p>
                        <button class="btn btn-primary" onclick="agregarDeuda()">➕ Agregar Primer Pago</button>
                    </div>
                `;
                return;
            }

            // Ordenar por días hasta vencimiento
            const deudasOrdenadas = [...deudas].sort((a, b) => {
                if (a.pagado && !b.pagado) return 1;
                if (!a.pagado && b.pagado) return -1;
                return calcularDiasRestantes(a.diaPago) - calcularDiasRestantes(b.diaPago);
            });

            grid.innerHTML = deudasOrdenadas.map(deuda => {
                const diasRestantes = calcularDiasRestantes(deuda.diaPago);
                const urgente = diasRestantes <= 3 && diasRestantes >= 0;
                const proximo = diasRestantes > 3 && diasRestantes <= 10;
                
                let estadoClase = '';
                let estadoTexto = '';
                
                if (deuda.pagado) {
                    estadoClase = 'pagado';
                    estadoTexto = '✅ Pagado';
                } else if (urgente) {
                    estadoClase = 'urgente';
                    estadoTexto = `⚠️ ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''}`;
                } else if (proximo) {
                    estadoClase = 'proximo';
                    estadoTexto = `🔔 ${diasRestantes} días restantes`;
                } else if (diasRestantes < 0) {
                    estadoClase = 'urgente';
                    estadoTexto = `❌ Vencido hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''}`;
                } else {
                    estadoTexto = `📅 ${diasRestantes} días restantes`;
                }

                const iconos = {
                    'Arrendamiento': '🏠',
                    'Luz': '💡',
                    'Internet': '🌐',
                    'Tarjeta de Crédito 1': '💳',
                    'Tarjeta de Crédito 2': '💳',
                    'Agua': '💧',
                    'Gas': '🔥',
                    'Teléfono': '📱',
                    'Otro': '📋'
                };

                return `
                    <div class="deuda-card ${estadoClase}">
                        <div class="deuda-header-card">
                            <h4 class="deuda-titulo">${deuda.nombre}</h4>
                            <span class="deuda-icono">${iconos[deuda.tipo] || '📋'}</span>
                        </div>
                        
                        <div class="deuda-info">
                            <div class="deuda-info-item">
                                <span class="deuda-info-label">Tipo:</span>
                                <span class="deuda-info-value">${deuda.tipo}</span>
                            </div>
                            <div class="deuda-info-item">
                                <span class="deuda-info-label">Día de pago:</span>
                                <span class="deuda-info-value">${deuda.diaPago} de cada mes</span>
                            </div>
                            ${deuda.monto ? `
                            <div class="deuda-info-item">
                                <span class="deuda-info-label">Monto:</span>
                                <span class="deuda-info-value">$${parseFloat(deuda.monto).toFixed(2)}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <div class="deuda-dias ${urgente ? 'urgente' : proximo ? 'proximo' : ''}">
                            ${estadoTexto}
                        </div>
                        
                        <div class="deuda-acciones">
                            ${!deuda.pagado ? `
                                <button class="btn-deuda btn-pagar" onclick="marcarComoPagado('${deuda.id}')">
                                    ✓ Pagado
                                </button>
                            ` : `
                                <button class="btn-deuda btn-pagar" onclick="marcarComoPendiente('${deuda.id}')">
                                    ↺ Pendiente
                                </button>
                            `}
                            <button class="btn-deuda btn-editar" onclick="editarDeuda('${deuda.id}')">
                                ✏️
                            </button>
                            <button class="btn-deuda btn-eliminar" onclick="eliminarDeuda('${deuda.id}')">
                                🗑️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function calcularDiasRestantes(diaPago) {
            const hoy = new Date();
            const mesActual = hoy.getMonth();
            const anioActual = hoy.getFullYear();
            
            let fechaPago = new Date(anioActual, mesActual, diaPago);
            
            // Si la fecha ya pasó este mes, usar el próximo mes
            if (fechaPago < hoy) {
                fechaPago = new Date(anioActual, mesActual + 1, diaPago);
            }
            
            const diffTime = fechaPago - hoy;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            return diffDays;
        }

        function agregarDeuda() {
            const tiposDeuda = [
                'Arrendamiento',
                'Luz',
                'Internet',
                'Tarjeta de Crédito 1',
                'Tarjeta de Crédito 2',
                'Agua',
                'Gas',
                'Teléfono',
                'Otro'
            ];

            const tiposOptions = tiposDeuda.map(tipo => 
                `<option value="${tipo}">${tipo}</option>`
            ).join('');

            Swal.fire({
                title: '➕ Agregar Nuevo Pago',
                html: `
                    <div style="text-align: left; padding: 10px;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Tipo de Pago:</label>
                            <select id="tipo-deuda" class="form-control" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                                <option value="">Seleccionar tipo...</option>
                                ${tiposOptions}
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nombre/Descripción:</label>
                            <input type="text" id="nombre-deuda" class="form-control" placeholder="Ej: Renta departamento, CFE, etc." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Día de Pago (1-31):</label>
                            <input type="number" id="dia-pago" class="form-control" min="1" max="31" placeholder="Ej: 15" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Monto (opcional):</label>
                            <input type="number" id="monto-deuda" class="form-control" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Notas (opcional):</label>
                            <textarea id="notas-deuda" class="form-control" rows="3" placeholder="Información adicional..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;"></textarea>
                        </div>
                    </div>
                `,
                width: '500px',
                showCancelButton: true,
                confirmButtonText: '💾 Guardar',
                cancelButtonText: '❌ Cancelar',
                preConfirm: () => {
                    const tipo = document.getElementById('tipo-deuda').value;
                    const nombre = document.getElementById('nombre-deuda').value;
                    const diaPago = document.getElementById('dia-pago').value;
                    const monto = document.getElementById('monto-deuda').value;
                    const notas = document.getElementById('notas-deuda').value;

                    if (!tipo || !nombre || !diaPago) {
                        Swal.showValidationMessage('Por favor completa los campos obligatorios');
                        return false;
                    }

                    if (diaPago < 1 || diaPago > 31) {
                        Swal.showValidationMessage('El día debe estar entre 1 y 31');
                        return false;
                    }

                    return {
                        tipo,
                        nombre,
                        diaPago: parseInt(diaPago),
                        monto: monto ? parseFloat(monto) : null,
                        notas: notas || '',
                        pagado: false,
                        fechaCreacion: new Date().toISOString()
                    };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const response = await fetch('/api/deudas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(result.value)
                        });

                        const data = await response.json();

                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: '✅ Pago Agregado',
                                text: 'El pago se ha registrado exitosamente',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        } else {
                            throw new Error(data.error || 'Error al guardar');
                        }
                    } catch (error) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo guardar el pago: ' + error.message
                        });
                    }
                }
            });
        }

        function editarDeuda(id) {
            const deuda = deudas.find(d => d.id === id);
            if (!deuda) return;

            const tiposDeuda = [
                'Arrendamiento',
                'Luz',
                'Internet',
                'Tarjeta de Crédito 1',
                'Tarjeta de Crédito 2',
                'Agua',
                'Gas',
                'Teléfono',
                'Otro'
            ];

            const tiposOptions = tiposDeuda.map(tipo => 
                `<option value="${tipo}" ${deuda.tipo === tipo ? 'selected' : ''}>${tipo}</option>`
            ).join('');

            Swal.fire({
                title: '✏️ Editar Pago',
                html: `
                    <div style="text-align: left; padding: 10px;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Tipo de Pago:</label>
                            <select id="tipo-deuda" class="form-control" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                                ${tiposOptions}
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Nombre/Descripción:</label>
                            <input type="text" id="nombre-deuda" class="form-control" value="${deuda.nombre}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Día de Pago (1-31):</label>
                            <input type="number" id="dia-pago" class="form-control" min="1" max="31" value="${deuda.diaPago}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Monto:</label>
                            <input type="number" id="monto-deuda" class="form-control" step="0.01" min="0" value="${deuda.monto || ''}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Notas:</label>
                            <textarea id="notas-deuda" class="form-control" rows="3" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">${deuda.notas || ''}</textarea>
                        </div>
                    </div>
                `,
                width: '500px',
                showCancelButton: true,
                confirmButtonText: '💾 Actualizar',
                cancelButtonText: '❌ Cancelar',
                preConfirm: () => {
                    const tipo = document.getElementById('tipo-deuda').value;
                    const nombre = document.getElementById('nombre-deuda').value;
                    const diaPago = document.getElementById('dia-pago').value;
                    const monto = document.getElementById('monto-deuda').value;
                    const notas = document.getElementById('notas-deuda').value;

                    if (!tipo || !nombre || !diaPago) {
                        Swal.showValidationMessage('Por favor completa los campos obligatorios');
                        return false;
                    }

                    if (diaPago < 1 || diaPago > 31) {
                        Swal.showValidationMessage('El día debe estar entre 1 y 31');
                        return false;
                    }

                    return {
                        tipo,
                        nombre,
                        diaPago: parseInt(diaPago),
                        monto: monto ? parseFloat(monto) : null,
                        notas: notas || ''
                    };
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const response = await fetch(`/api/deudas/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(result.value)
                        });

                        const data = await response.json();

                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: '✅ Actualizado',
                                text: 'El pago se ha actualizado exitosamente',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        } else {
                            throw new Error(data.error || 'Error al actualizar');
                        }
                    } catch (error) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: 'No se pudo actualizar: ' + error.message
                        });
                    }
                }
            });
        }

        async function marcarComoPagado(id) {
            try {
                const response = await fetch(`/api/deudas/${id}/pagar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pagado: true })
                });

                const data = await response.json();

                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '✅ Marcado como Pagado',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } else {
                    throw new Error(data.error || 'Error al actualizar');
                }
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error.message
                });
            }
        }

        async function marcarComoPendiente(id) {
            try {
                const response = await fetch(`/api/deudas/${id}/pagar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pagado: false })
                });

                const data = await response.json();

                if (data.success) {
                    Swal.fire({
                        icon: 'info',
                        title: '📋 Marcado como Pendiente',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } else {
                    throw new Error(data.error || 'Error al actualizar');
                }
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error.message
                });
            }
        }

        function eliminarDeuda(id) {
            const deuda = deudas.find(d => d.id === id);
            if (!deuda) return;

            Swal.fire({
                title: '¿Eliminar pago?',
                html: `¿Estás seguro de que deseas eliminar <strong>${deuda.nombre}</strong>?<br>Esta acción no se puede deshacer.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const response = await fetch(`/api/deudas/${id}`, {
                            method: 'DELETE'
                        });

                        const data = await response.json();

                        if (data.success) {
                            Swal.fire({
                                icon: 'success',
                                title: '✅ Eliminado',
                                text: 'El pago se ha eliminado exitosamente',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        } else {
                            throw new Error(data.error || 'Error al eliminar');
                        }
                    } catch (error) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error',
                            text: error.message
                        });
                    }
                }
            });
        }

        // ============================================
        // SISTEMA DE NOTIFICACIONES
        // ============================================
        async function verificarNotificaciones() {
            try {
                const response = await fetch('/api/deudas/notificaciones');
                const data = await response.json();

                if (data.success && data.notificaciones) {
                    notificacionesPendientes = data.notificaciones;
                    
                    // Actualizar badge
                    const badge = document.getElementById('notification-badge');
                    if (notificacionesPendientes.length > 0) {
                        badge.textContent = notificacionesPendientes.length;
                        badge.style.display = 'flex';
                    } else {
                        badge.style.display = 'none';
                    }

                    // Mostrar notificaciones urgentes
                    const urgentes = notificacionesPendientes.filter(n => n.urgente);
                    urgentes.forEach(notif => {
                        mostrarNotificacionToast(notif);
                    });
                }
            } catch (error) {
                console.error('Error verificando notificaciones:', error);
            }
        }

        function mostrarNotificacionToast(notif) {
            const container = document.getElementById('notification-container');
            const notifId = `notif-${Date.now()}`;
            
            const notifElement = document.createElement('div');
            notifElement.id = notifId;
            notifElement.className = `notification-item ${notif.urgente ? 'urgent' : ''}`;
            notifElement.innerHTML = `
                <div class="notification-icon">${notif.urgente ? '⚠️' : '🔔'}</div>
                <div class="notification-content">
                    <h6>${notif.titulo}</h6>
                    <p>${notif.mensaje}</p>
                </div>
            `;
            
            container.appendChild(notifElement);

            // Auto-remover después de 10 segundos
            setTimeout(() => {
                notifElement.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => {
                    notifElement.remove();
                }, 300);
            }, 10000);

            // Remover al hacer click
            notifElement.addEventListener('click', () => {
                notifElement.style.animation = 'slideIn 0.3s ease reverse';
                setTimeout(() => {
                    notifElement.remove();
                }, 300);
            });
        }

        // ============================================
        // INICIALIZACIÓN CON API
        // ============================================
        async function inicializarDeudas() {
            try {
                const response = await fetch('/api/deudas');
                const data = await response.json();

                if (data.success) {
                    deudas = data.deudas || [];
                    
                    if (document.getElementById('deudas-page').style.display !== 'none') {
                        renderizarDeudas();
                    }
                    
                    verificarNotificaciones();
                }
            } catch (error) {
                console.error('Error inicializando deudas:', error);
            }
        }

// ============================================
// FUNCIONES DEL BOT
// ============================================
function reconectarBot() { 
    fetch('/reiniciar'); 
    Swal.fire('Reconectando...', '', 'info'); 
}

function reiniciarServidor() { 
    fetch('/reiniciar'); 
    Swal.fire('Servidor reiniciado', '', 'success'); 
}