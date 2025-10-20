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
    
    console.log('🔍 Buscando citas para:', {
        fecha: date.toLocaleDateString('es-ES'),
        hora: `${hour}:${minute}`,
        slotStart: slotStart.toLocaleString('es-ES'),
        slotEnd: slotEnd.toLocaleString('es-ES'),
        totalCitas: appointments.length
    });
    
    const citasEncontradas = appointments.filter(apt => {
        // Solo contar citas confirmadas o en proceso (no canceladas)
        if (!['Reservada', 'Confirmada', 'En Proceso', 'Finalizada'].includes(apt.status)) {
            return false;
        }
        
        const aptStart = apt.date;
        const aptEnd = apt.endTime;
        
        // Verificar si hay superposición de tiempo
        const haySuperposicion = !(aptEnd <= slotStart || aptStart >= slotEnd);
        
        if (haySuperposicion) {
            console.log('✅ Cita encontrada:', {
                cliente: apt.client,
                servicio: apt.service,
                inicio: aptStart.toLocaleString('es-ES'),
                fin: aptEnd.toLocaleString('es-ES')
            });
        }
        
        return haySuperposicion;
    });
    
    console.log(`📊 Total de citas en este horario: ${citasEncontradas.length}`);
    
    return citasEncontradas;
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
            const citasHtml = aptsInSlot.map((apt, index) => `
                <div style="background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 8px; cursor: pointer; border: 2px solid #e1e5f7; transition: all 0.2s;" 
                     onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f4ff';" 
                     onmouseout="this.style.borderColor='#e1e5f7'; this.style.background='#f8f9fa';"
                     onclick="event.stopPropagation(); showAppointmentDetails('${apt.id}'); Swal.close();">
                    <div style="font-size: 1.1rem; margin-bottom: 8px;">
                        <strong>👤 ${apt.client}</strong>
                    </div>
                    <div style="margin-bottom: 5px;">
                        ✂️ ${apt.service} (${apt.duracion}min)
                    </div>
                    <div style="margin-bottom: 5px; color: #666;">
                        🕐 ${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})} - ${apt.endTime.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}
                    </div>
                    <div style="font-size: 0.85rem; padding: 5px 10px; background: ${getStatusColor(apt.status)}; border-radius: 4px; display: inline-block; color: white;">
                        📊 ${apt.status}
                    </div>
                </div>
            `).join('');
            
            Swal.fire({
                title: `📋 Citas en este horario (${aptsInSlot.length})`,
                html: `
                    <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                        ${citasHtml}
                    </div>
                    <div style="margin-top: 15px; padding: 10px; background: #f8f9ff; border-radius: 6px; font-size: 0.9rem; color: #666;">
                        💡 Haz clic en una cita para ver todos sus detalles
                    </div>
                `,
                width: '600px',
                showConfirmButton: false,
                showCloseButton: true
            });
        }
        return;
    }
    
// Función auxiliar para obtener colores según el estado
function getStatusColor(status) {
    const colors = {
        'Reservada': '#17a2b8',
        'Confirmada': '#28a745',
        'En Proceso': '#ffc107',
        'Finalizada': '#6c757d',
        'Cancelada': '#dc3545'
    };
    return colors[status] || '#6c757d';
}

    // Si el horario está disponible, mostrar opción de agregar cita
    const hourStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const dateFormatted = date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    Swal.fire({
        title: `📅 ${dateFormatted}`,
        html: `
            <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <div style="font-size: 3rem; margin-bottom: 15px;">✅</div>
                <p style="margin-bottom: 15px; font-size: 1.2rem; color: #155724;">
                    <strong>Horario Disponible</strong>
                </p>
                <p style="margin-bottom: 20px; font-size: 1.4rem; color: #155724; font-weight: 600;">
                    🕐 ${hourStr}
                </p>
                <button onclick="showNewAppointmentForm('${dateStr}', '${hourStr}'); Swal.close();" 
                        class="btn btn-success"
                        style="padding: 12px 30px; font-size: 1.1rem; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); transition: all 0.3s;"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 15px rgba(0,0,0,0.2)';"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 10px rgba(0,0,0,0.15)';">
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
                            <option value="">Buscar cliente...</option>
                            ${clientesOptions}
                        </select>
                        <button type="button" onclick="agregarClienteRapido()" class="btn btn-sm btn-info" style="white-space: nowrap;">➕ Nuevo</button>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="servicio" style="display: block; margin-bottom: 5px; font-weight: bold;">Servicio:</label>
                    <div style="display: flex; gap: 5px;">
                        <select id="servicio" class="form-control" required style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="">Buscar servicio...</option>
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
        width: '550px',
        showCancelButton: true,
        confirmButtonText: '💾 Crear Cita',
        cancelButtonText: '❌ Cancelar',
        didOpen: () => {
            // Función helper para inicializar Select2 de forma segura
            const initSelect2Safe = (selector, options) => {
                const $element = $(selector);
                if ($element.length === 0) return;
                
                // Verificar si ya tiene Select2 inicializado
                if ($element.data('select2')) {
                    try {
                        $element.select2('destroy');
                    } catch (e) {
                        console.warn('Error al destruir Select2 previo:', e);
                    }
                }
                
                // Inicializar Select2
                try {
                    $element.select2(options);
                } catch (e) {
                    console.error('Error al inicializar Select2:', e);
                }
            };

            // Inicializar Select2 para clientes
            initSelect2Safe('#cliente', {
                dropdownParent: $('.swal2-container'),
                placeholder: 'Buscar cliente...',
                allowClear: true,
                width: '100%',
                language: {
                    noResults: function() {
                        return "No se encontraron clientes";
                    },
                    searching: function() {
                        return "Buscando...";
                    }
                }
            });

            // Inicializar Select2 para servicios
            initSelect2Safe('#servicio', {
                dropdownParent: $('.swal2-container'),
                placeholder: 'Buscar servicio...',
                allowClear: true,
                width: '100%',
                language: {
                    noResults: function() {
                        return "No se encontraron servicios";
                    },
                    searching: function() {
                        return "Buscando...";
                    }
                }
            });

            // Inicializar Select2 para hora
            initSelect2Safe('#hora', {
                dropdownParent: $('.swal2-container'),
                placeholder: 'Seleccionar hora...',
                allowClear: true,
                width: '100%'
            });
        },
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
        },
        willClose: () => {
            // Función helper para destruir Select2 de forma segura
            const destroySelect2Safe = (selector) => {
                const $element = $(selector);
                if ($element.length === 0) return;
                
                // Solo destruir si tiene Select2 inicializado
                if ($element.data('select2')) {
                    try {
                        $element.select2('destroy');
                    } catch (e) {
                        console.warn(`Error al destruir Select2 en ${selector}:`, e);
                    }
                }
            };

            // Destruir Select2 al cerrar
            destroySelect2Safe('#cliente');
            destroySelect2Safe('#servicio');
            destroySelect2Safe('#hora');
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await createNewAppointment(result.value);
        }
    });
}

// Función auxiliar global para inicializar Select2 de forma segura (opcional, puedes ponerla fuera)
function initSelect2Safe(selector, options = {}) {
    const $element = $(selector);
    
    if ($element.length === 0) {
        console.warn(`Elemento ${selector} no encontrado`);
        return null;
    }
    
    // Destruir instancia previa si existe
    if ($element.data('select2')) {
        try {
            $element.select2('destroy');
        } catch (e) {
            console.warn('Error al destruir Select2 previo:', e);
        }
    }
    
    // Inicializar Select2
    try {
        return $element.select2(options);
    } catch (e) {
        console.error('Error al inicializar Select2:', e);
        return null;
    }
}

// Función auxiliar global para destruir Select2 de forma segura (opcional)
function destroySelect2Safe(selector) {
    const $element = $(selector);
    
    if ($element.length === 0) return;
    
    if ($element.data('select2')) {
        try {
            $element.select2('destroy');
        } catch (e) {
            console.warn(`Error al destruir Select2 en ${selector}:`, e);
        }
    }
}

// ============================================
// FUNCIÓN PARA AGREGAR CLIENTE RÁPIDO
// ============================================
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
                    
                    // Actualizar Select2 con el nuevo cliente
                    const nuevoClienteOption = new Option(
                        `${nombre} (${telefono})`,
                        result.id || result.clienteId,
                        true,
                        true
                    );
                    $('#cliente').append(nuevoClienteOption).trigger('change');
                    
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

// ============================================
// FUNCIÓN PARA AGREGAR SERVICIO RÁPIDO
// ============================================
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
                    
                    // Actualizar Select2 con el nuevo servicio
                    const nuevoServicioOption = new Option(
                        `${nombre} - ${precio} (${duracion}min)`,
                        result.id || result.servicioId,
                        true,
                        true
                    );
                    $('#servicio').append(nuevoServicioOption).trigger('change');
                    
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
    console.log('🔍 Buscando cita con ID:', appointmentId);
    console.log('📋 Todas las citas disponibles:', appointments.map(a => ({ id: a.id, cliente: a.client })));
    
    const apt = appointments.find(a => a.id === appointmentId || a.id === String(appointmentId));
    
    if (!apt) {
        console.error('❌ Cita no encontrada. ID buscado:', appointmentId);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Cita no encontrada',
            confirmButtonColor: '#667eea'
        });
        return;
    }

    console.log('✅ Cita encontrada:', apt);

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
                <p style="margin: 8px 0;"><strong>📞 Teléfono:</strong> ${apt.telefono || 'No disponible'}</p>
            </div>
            
            <div style="background: white; padding: 15px; border: 1px solid #e1e5f7; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>✂️ Servicio:</strong> ${apt.service}</p>
                <p style="margin: 8px 0;"><strong>💅 Manicurista:</strong> ${apt.manicurista || 'No asignado'}</p>
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
    document.getElementById('profile-dropdown').classList.remove('show');
    cargarDeudas();
    cargarResumenDeudas();
}

function cerrarDeudas() {
    document.getElementById('deudas-page').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function verNotificaciones() {
    document.getElementById('profile-dropdown').classList.remove('show');
    cargarNotificaciones();
}

function configuracion() {
    Swal.fire('⚙️ Configuración', 'Función en desarrollo', 'info');
}

function cerrarSesion() {
    Swal.fire({
        title: '🚪 Cerrar Sesión',
        text: '¿Estás seguro de que deseas salir?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, salir',
        cancelButtonText: 'Cancelar'
    }).then(result => {
        if (result.isConfirmed) {
            window.location.href = '/login';
        }
    });
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function calcularDiasRestantes(diaPago) {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    
    let fechaPago = new Date(anioActual, mesActual, diaPago);
    if (fechaPago < hoy) {
        fechaPago = new Date(anioActual, mesActual + 1, diaPago);
    }
    const diffTime = fechaPago - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function formatearMoneda(monto) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(monto || 0);
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ============================================
// FUNCIONES DE DEUDAS
// ============================================
async function inicializarDeudas() {
    try {
        const res = await fetch('/api/deudas');
        const data = await res.json();
        if (data.success) {
            deudas = data.deudas || [];
            renderizarDeudas();
            verificarNotificaciones();
        } else {
            console.error('Error obteniendo deudas:', data.error);
        }
    } catch (error) {
        console.error('Error inicializando deudas:', error);
    }
}

function renderizarDeudas() {
    const contenedor = document.getElementById('deudas-grid');
    if (!contenedor) return;

    contenedor.innerHTML = '';

    if (deudas.length === 0) {
        contenedor.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; grid-column: 1 / -1;">
                <div style="font-size: 4rem; margin-bottom: 20px;">💳</div>
                <h3 style="color: #666; margin-bottom: 10px;">No hay pagos registrados</h3>
                <p style="color: #999;">Comienza agregando tu primer pago recurrente</p>
            </div>
        `;
        return;
    }

    // Ordenar deudas: primero pendientes, luego por días restantes
    const deudasOrdenadas = [...deudas].sort((a, b) => {
        if (a.pagado !== b.pagado) return a.pagado ? 1 : -1;
        return calcularDiasRestantes(a.diaPago) - calcularDiasRestantes(b.diaPago);
    });

    deudasOrdenadas.forEach(deuda => {
        const diasRestantes = calcularDiasRestantes(deuda.diaPago);
        const urgente = diasRestantes <= 3 && !deuda.pagado;
        const vencido = diasRestantes < 0 && !deuda.pagado;
        
        let estadoClass = 'success';
        let estadoTexto = '✅ Pagado';
        let diasTexto = '';
        
        if (!deuda.pagado) {
            if (vencido) {
                estadoClass = 'danger';
                estadoTexto = '❌ Vencido';
                diasTexto = `hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''}`;
            } else if (urgente) {
                estadoClass = 'warning';
                estadoTexto = '⚠️ Urgente';
                diasTexto = diasRestantes === 0 ? 'HOY' : diasRestantes === 1 ? 'MAÑANA' : `en ${diasRestantes} días`;
            } else {
                estadoClass = 'info';
                estadoTexto = '⏳ Pendiente';
                diasTexto = `en ${diasRestantes} días`;
            }
        } else {
            diasTexto = formatearFecha(deuda.fechaPago);
        }

        const card = document.createElement('div');
        card.className = 'deuda-card';
        card.style.borderLeft = `4px solid var(--bs-${estadoClass})`;
        card.innerHTML = `
            <div class="deuda-card-header">
                <div>
                    <h5 style="margin: 0; color: #333;">${deuda.nombre}</h5>
                    <small style="color: #666;">📋 ${deuda.tipo}</small>
                </div>
                <span class="badge bg-${estadoClass}">${estadoTexto}</span>
            </div>
            <div class="deuda-card-body">
                <div class="deuda-info">
                    <div class="deuda-info-item">
                        <span class="deuda-label">💰 Monto</span>
                        <span class="deuda-value">${formatearMoneda(deuda.monto)}</span>
                    </div>
                    <div class="deuda-info-item">
                        <span class="deuda-label">📅 Día de pago</span>
                        <span class="deuda-value">${deuda.diaPago}</span>
                    </div>
                    <div class="deuda-info-item">
                        <span class="deuda-label">⏰ ${deuda.pagado ? 'Pagado' : 'Vence'}</span>
                        <span class="deuda-value ${urgente ? 'text-danger fw-bold' : ''}">${diasTexto}</span>
                    </div>
                </div>
                ${deuda.notas ? `<div class="deuda-notas">📝 ${deuda.notas}</div>` : ''}
            </div>
            <div class="deuda-card-footer">
                <button class="btn btn-sm btn-outline-primary" onclick="verHistorial('${deuda.id}', '${deuda.nombre}')">
                    📊 Historial
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="editarDeuda('${deuda.id}')">
                    ✏️ Editar
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="eliminarDeuda('${deuda.id}')">
                    🗑️
                </button>
                <button class="btn btn-sm btn-${deuda.pagado ? 'warning' : 'success'}" onclick="togglePago('${deuda.id}', ${deuda.pagado})">
                    ${deuda.pagado ? '🔁 Pendiente' : '✅ Pagar'}
                </button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

async function cargarDeudas() {
    const contenedor = document.getElementById('deudas-grid');
    if (!contenedor) return;
    contenedor.innerHTML = `<div style="text-align: center; padding: 40px; grid-column: 1 / -1;"><div class="spinner-border text-primary"></div><p style="margin-top: 10px; color: #999;">Cargando pagos...</p></div>`;

    try {
        const res = await fetch('/api/deudas');
        const data = await res.json();

        if (!data.success || !data.deudas || data.deudas.length === 0) {
            deudas = [];
            renderizarDeudas();
            return;
        }

        deudas = data.deudas;
        renderizarDeudas();

    } catch (error) {
        contenedor.innerHTML = `<div style="text-align: center; padding: 40px; color: red; grid-column: 1 / -1;">❌ Error al cargar: ${error.message}</div>`;
        console.error('Error cargando deudas:', error);
    }
}

async function cargarResumenDeudas() {
    try {
        const res = await fetch('/api/deudas/resumen');
        const data = await res.json();
        
        if (data.success) {
            const resumen = data.resumen;
            document.getElementById('resumen-stats').innerHTML = `
                <div class="stat-item">
                    <div class="stat-number">${resumen.totalDeudas}</div>
                    <div class="stat-label">Total Pagos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-success">${resumen.totalPagadas}</div>
                    <div class="stat-label">Pagados</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-danger">${resumen.totalPendientes}</div>
                    <div class="stat-label">Pendientes</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-warning">${resumen.proximasVencer}</div>
                    <div class="stat-label">Por Vencer</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatearMoneda(resumen.montoTotal)}</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-danger">${formatearMoneda(resumen.montoPendiente)}</div>
                    <div class="stat-label">Pendiente</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error cargando resumen:', error);
    }
}

async function agregarDeuda() {
    const tipos = ['Arrendamiento','Luz','Agua','Internet','Teléfono','Gas','Tarjeta de Crédito 1','Tarjeta de Crédito 2','Netflix','Spotify','Gimnasio','Seguro','Otro'];
    const opcionesTipo = tipos.map(t => `<option value="${t}">${t}</option>`).join('');

    Swal.fire({
        title: '➕ Agregar Nuevo Pago',
        html: `
            <div class="text-start" style="max-width: 500px; margin: 0 auto;">
                <div class="mb-3">
                    <label class="form-label fw-bold">Nombre del Pago *</label>
                    <input type="text" id="nombre-deuda" class="form-control" placeholder="Ej: Renta departamento">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Tipo de Pago *</label>
                    <select id="tipo-deuda" class="form-control">
                        <option value="">Seleccionar tipo...</option>
                        ${opcionesTipo}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Día de Pago (1-31) *</label>
                    <input type="number" id="dia-pago" class="form-control" min="1" max="31" placeholder="15">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Monto *</label>
                    <input type="number" id="monto-deuda" class="form-control" step="0.01" placeholder="0.00">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Notas (opcional)</label>
                    <textarea id="notas-deuda" class="form-control" rows="2" placeholder="Información adicional..."></textarea>
                </div>
            </div>
        `,
        confirmButtonText: '💾 Guardar Pago',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '600px',
        customClass: {
            container: 'swal-on-top'
        },
        preConfirm: () => {
            const nombre = document.getElementById('nombre-deuda').value.trim();
            const tipo = document.getElementById('tipo-deuda').value;
            const diaPago = parseInt(document.getElementById('dia-pago').value);
            const monto = parseFloat(document.getElementById('monto-deuda').value || 0);
            const notas = document.getElementById('notas-deuda').value.trim();
            
            if (!nombre || !tipo || !diaPago || !monto) {
                Swal.showValidationMessage('Por favor completa todos los campos obligatorios');
                return false;
            }
            if (diaPago < 1 || diaPago > 31) {
                Swal.showValidationMessage('El día debe estar entre 1 y 31');
                return false;
            }
            return { nombre, tipo, diaPago, monto, notas };
        }
    }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await fetch('/api/deudas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '✅ ¡Guardado!',
                    text: 'Pago agregado exitosamente',
                    timer: 2000,
                    customClass: { container: 'swal-on-top' }
                });
                cargarDeudas();
                cargarResumenDeudas();
            } else {
                Swal.fire({
                    icon: 'error',
                    title: '❌ Error',
                    text: data.error || 'No se pudo guardar',
                    customClass: { container: 'swal-on-top' }
                });
            }
        }
    });
}

async function editarDeuda(id) {
    const deuda = deudas.find(d => d.id === id);
    if (!deuda) return;

    const tipos = ['Arrendamiento','Luz','Agua','Internet','Teléfono','Gas','Tarjeta de Crédito 1','Tarjeta de Crédito 2','Netflix','Spotify','Gimnasio','Seguro','Otro'];
    const opcionesTipo = tipos.map(t => `<option value="${t}" ${t === deuda.tipo ? 'selected' : ''}>${t}</option>`).join('');

    Swal.fire({
        title: '✏️ Editar Pago',
        html: `
            <div class="text-start" style="max-width: 500px; margin: 0 auto;">
                <div class="mb-3">
                    <label class="form-label fw-bold">Nombre del Pago</label>
                    <input type="text" id="edit-nombre" class="form-control" value="${deuda.nombre}">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Tipo de Pago</label>
                    <select id="edit-tipo" class="form-control">
                        ${opcionesTipo}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Día de Pago (1-31)</label>
                    <input type="number" id="edit-dia" class="form-control" value="${deuda.diaPago}" min="1" max="31">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Monto</label>
                    <input type="number" id="edit-monto" class="form-control" value="${deuda.monto || ''}" step="0.01">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Notas</label>
                    <textarea id="edit-notas" class="form-control" rows="2">${deuda.notas || ''}</textarea>
                </div>
            </div>
        `,
        confirmButtonText: '💾 Guardar Cambios',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '600px',
        customClass: {
            container: 'swal-on-top'
        },
        preConfirm: () => ({
            nombre: document.getElementById('edit-nombre').value.trim(),
            tipo: document.getElementById('edit-tipo').value,
            diaPago: parseInt(document.getElementById('edit-dia').value),
            monto: parseFloat(document.getElementById('edit-monto').value || 0),
            notas: document.getElementById('edit-notas').value.trim()
        })
    }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await fetch(`/api/deudas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '✅ Actualizado',
                    text: 'Pago modificado exitosamente',
                    timer: 2000,
                    customClass: { container: 'swal-on-top' }
                });
                cargarDeudas();
                cargarResumenDeudas();
            } else {
                Swal.fire({
                    icon: 'error',
                    title: '❌ Error',
                    text: data.error || 'No se pudo actualizar',
                    customClass: { container: 'swal-on-top' }
                });
            }
        }
    });
}

async function eliminarDeuda(id) {
    const result = await Swal.fire({
        title: '🗑️ Eliminar Pago',
        text: '¿Seguro que deseas eliminar este pago? Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545',
        customClass: {
            container: 'swal-on-top'
        }
    });
    
    if (!result.isConfirmed) return;

    const res = await fetch(`/api/deudas/${id}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (data.success) {
        Swal.fire({
            icon: 'success',
            title: '✅ Eliminado',
            text: 'Pago eliminado exitosamente',
            timer: 2000,
            customClass: { container: 'swal-on-top' }
        });
        cargarDeudas();
        cargarResumenDeudas();
    } else {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: data.error || 'No se pudo eliminar',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function togglePago(id, pagado) {
    try {
        const res = await fetch(`/api/deudas/${id}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pagado: !pagado })
        });
        const data = await res.json();
        
        if (data.success) {
            // Agregar al historial si se marcó como pagado
            if (!pagado) {
                const deuda = deudas.find(d => d.id === id);
                await fetch(`/api/deudas/${id}/agregar-historial`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        monto: deuda.monto,
                        notas: 'Pago registrado desde el dashboard'
                    })
                });
            }
            
            Swal.fire({
                icon: 'success',
                title: pagado ? '🔁 Marcado como Pendiente' : '✅ Pago Registrado',
                timer: 1500,
                showConfirmButton: false,
                customClass: { container: 'swal-on-top' }
            });
            cargarDeudas();
            cargarResumenDeudas();
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo actualizar el estado del pago',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function verHistorial(id, nombre) {
    try {
        const res = await fetch(`/api/deudas/historial/${id}`);
        const data = await res.json();
        
        let contenidoHTML = '';
        
        if (data.success && data.historial && data.historial.length > 0) {
            contenidoHTML = `
                <div class="historial-container" style="max-height: 400px; overflow-y: auto;">
                    ${data.historial.map(entrada => `
                        <div class="historial-item" style="border-left: 3px solid #28a745; padding: 15px; margin-bottom: 15px; background: #f8f9fa; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="color: #333;">💰 ${formatearMoneda(entrada.monto)}</strong>
                                <span style="color: #666; font-size: 0.9rem;">${formatearFecha(entrada.fecha)}</span>
                            </div>
                            ${entrada.notas ? `<p style="margin: 0; color: #666; font-size: 0.9rem;">📝 ${entrada.notas}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            contenidoHTML = '<p style="text-align: center; color: #999; padding: 40px;">📊 Sin historial de pagos</p>';
        }
        
        Swal.fire({
            title: `📊 Historial: ${nombre}`,
            html: contenidoHTML,
            width: '600px',
            customClass: {
                container: 'swal-on-top'
            }
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo cargar el historial',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function resetearPagos() {
    const result = await Swal.fire({
        title: '🔄 Resetear Todos los Pagos',
        text: '¿Deseas marcar todos los pagos como pendientes? Esto es útil al inicio de cada mes.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, resetear',
        cancelButtonText: 'Cancelar',
        customClass: {
            container: 'swal-on-top'
        }
    });
    
    if (!result.isConfirmed) return;
    
    try {
        const res = await fetch('/api/deudas/resetear-pagos', {
            method: 'POST'
        });
        const data = await res.json();
        
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '✅ Reseteado',
                text: 'Todos los pagos han sido marcados como pendientes',
                timer: 2000,
                customClass: { container: 'swal-on-top' }
            });
            cargarDeudas();
            cargarResumenDeudas();
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo resetear los pagos',
            customClass: { container: 'swal-on-top' }
        });
    }
}

// ============================================
// NOTIFICACIONES
// ============================================

async function cargarNotificaciones() {
    // Mostrar loading
    Swal.fire({
        title: '🔔 Cargando Notificaciones',
        html: '<div class="spinner-border text-primary" role="status"></div>',
        showConfirmButton: false,
        allowOutsideClick: false,
        customClass: { container: 'swal-on-top' }
    });

    try {
        const res = await fetch('/api/deudas/notificaciones');
        
        if (!res.ok) {
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();
        
        console.log('Notificaciones recibidas:', data); // Para debug
        
        if (!data.success) {
            throw new Error(data.error || 'Error al obtener notificaciones');
        }
        
        if (!data.notificaciones || data.notificaciones.length === 0) {
            Swal.fire({
                icon: 'info',
                title: '🔔 Notificaciones',
                html: `
                    <div style="padding: 40px 20px; text-align: center;">
                        <div style="font-size: 4rem; margin-bottom: 20px; opacity: 0.5;">✅</div>
                        <h4 style="color: #666; margin-bottom: 10px;">¡Todo al día!</h4>
                        <p style="color: #999;">No hay notificaciones pendientes en este momento</p>
                    </div>
                `,
                customClass: { container: 'swal-on-top' }
            });
            actualizarBadgeNotificaciones(0);
            return;
        }
        
        const notificaciones = data.notificaciones;
        actualizarBadgeNotificaciones(notificaciones.length);
        
        // Separar por urgencia
        const urgentes = notificaciones.filter(n => n.urgente);
        const normales = notificaciones.filter(n => !n.urgente);
        
        let contenidoHTML = '<div style="max-height: 500px; overflow-y: auto; text-align: left;">';
        
        // Mostrar urgentes primero
        if (urgentes.length > 0) {
            contenidoHTML += `
                <div style="margin-bottom: 20px;">
                    <h5 style="color: #dc3545; margin-bottom: 15px;">⚠️ Urgentes (${urgentes.length})</h5>
                    ${urgentes.map(notif => crearTarjetaNotificacion(notif)).join('')}
                </div>
            `;
        }
        
        // Mostrar normales
        if (normales.length > 0) {
            contenidoHTML += `
                <div>
                    <h5 style="color: #ffc107; margin-bottom: 15px;">🔔 Próximos (${normales.length})</h5>
                    ${normales.map(notif => crearTarjetaNotificacion(notif)).join('')}
                </div>
            `;
        }
        
        contenidoHTML += '</div>';
        
        Swal.fire({
            title: `🔔 Notificaciones de Pagos (${notificaciones.length})`,
            html: contenidoHTML,
            width: '700px',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                container: 'swal-on-top'
            },
            footer: `
                <div style="text-align: center; color: #666; font-size: 0.9rem;">
                    <p style="margin: 0;">💡 Las notificaciones se actualizan automáticamente cada 30 minutos</p>
                </div>
            `
        });
        
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        Swal.fire({
            icon: 'error',
            title: '❌ Error de Conexión',
            html: `
                <p>No se pudieron cargar las notificaciones</p>
                <p style="color: #666; font-size: 0.9rem; margin-top: 10px;">
                    <strong>Detalles:</strong> ${error.message}
                </p>
                <p style="color: #999; font-size: 0.85rem; margin-top: 10px;">
                    Verifica tu conexión a internet e intenta nuevamente
                </p>
            `,
            customClass: { container: 'swal-on-top' },
            showConfirmButton: true,
            confirmButtonText: '🔄 Reintentar'
        }).then((result) => {
            if (result.isConfirmed) {
                cargarNotificaciones();
            }
        });
    }
}

function crearTarjetaNotificacion(notif) {
    const esUrgente = notif.urgente;
    const colorBorde = esUrgente ? '#dc3545' : '#ffc107';
    const colorFondo = esUrgente ? '#fff5f5' : '#fffbf0';
    const colorTexto = esUrgente ? '#dc3545' : '#856404';
    
    return `
        <div class="notificacion-item" style="
            border-left: 4px solid ${colorBorde};
            padding: 15px;
            margin-bottom: 15px;
            background: ${colorFondo};
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        " onmouseover="this.style.transform='translateX(5px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='translateX(0)'; this.style.boxShadow='none';">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <strong style="color: ${colorTexto}; font-size: 1.05rem;">
                    ${notif.titulo}
                </strong>
                <span style="background: ${colorBorde}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                    ${notif.tipo}
                </span>
            </div>
            <p style="margin: 8px 0; color: #333; font-size: 0.95rem;">${notif.mensaje}</p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${esUrgente ? '#fdd' : '#ffe'};;">
                <div>
                    <span style="color: #666; font-size: 0.9rem; display: block;">💰 ${formatearMoneda(notif.monto)}</span>
                    <span style="color: #999; font-size: 0.8rem;">
                        ${notif.diasRestantes === 0 ? '⏰ Vence HOY' : 
                          notif.diasRestantes === 1 ? '⏰ Vence MAÑANA' :
                          notif.diasRestantes < 0 ? `❌ Vencido hace ${Math.abs(notif.diasRestantes)} día${Math.abs(notif.diasRestantes) !== 1 ? 's' : ''}` :
                          `📅 En ${notif.diasRestantes} días`}
                    </span>
                </div>
                <button onclick="verDeudaDesdeNotificacion('${notif.id}')" class="btn btn-sm btn-${esUrgente ? 'danger' : 'warning'}" style="font-weight: 500;">
                    Ver Detalles →
                </button>
            </div>
        </div>
    `;
}

function actualizarBadgeNotificaciones(cantidad) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        if (cantidad > 0) {
            badge.textContent = cantidad;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function verificarNotificaciones() {
    try {
        const res = await fetch('/api/deudas/notificaciones');
        const data = await res.json();
        
        if (data.success && data.notificaciones) {
            const cantidad = data.notificaciones.length;
            actualizarBadgeNotificaciones(cantidad);
            
            // Mostrar toast si hay notificaciones urgentes
            const urgentes = data.notificaciones.filter(n => n.urgente);
            if (urgentes.length > 0) {
                mostrarNotificacionToast(`⚠️ ${urgentes.length} pago${urgentes.length > 1 ? 's' : ''} urgente${urgentes.length > 1 ? 's' : ''}`, 'danger');
            }
        }
    } catch (error) {
        console.error('Error verificando notificaciones:', error);
    }
}

async function verDeudaDesdeNotificacion(id) {
    Swal.close();
    
    // Buscar la deuda
    const deuda = deudas.find(d => d.id === id);
    if (!deuda) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se encontró el pago',
            customClass: { container: 'swal-on-top' }
        });
        return;
    }
    
    const diasRestantes = calcularDiasRestantes(deuda.diaPago);
    const vencido = diasRestantes < 0;
    
    let estadoHTML = '';
    if (vencido) {
        estadoHTML = `<span class="badge bg-danger">❌ Vencido hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) !== 1 ? 's' : ''}</span>`;
    } else if (diasRestantes === 0) {
        estadoHTML = `<span class="badge bg-warning">⏰ Vence HOY</span>`;
    } else if (diasRestantes === 1) {
        estadoHTML = `<span class="badge bg-warning">⏰ Vence MAÑANA</span>`;
    } else {
        estadoHTML = `<span class="badge bg-info">📅 Vence en ${diasRestantes} días</span>`;
    }
    
    Swal.fire({
        title: `💳 ${deuda.nombre}`,
        html: `
            <div class="text-start" style="max-width: 500px; margin: 0 auto;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h5 style="margin: 0; color: #333;">📋 ${deuda.tipo}</h5>
                        ${estadoHTML}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                        <div>
                            <div style="color: #666; font-size: 0.9rem; margin-bottom: 5px;">💰 Monto</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${formatearMoneda(deuda.monto)}</div>
                        </div>
                        <div>
                            <div style="color: #666; font-size: 0.9rem; margin-bottom: 5px;">📅 Día de Pago</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${deuda.diaPago}</div>
                        </div>
                    </div>
                    
                    ${deuda.notas ? `
                        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #dee2e6;">
                            <div style="color: #666; font-size: 0.9rem; margin-bottom: 5px;">📝 Notas</div>
                            <div style="color: #555;">${deuda.notas}</div>
                        </div>
                    ` : ''}
                </div>
                
                ${!deuda.pagado ? `
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 15px;">
                        <strong style="color: #856404;">⚠️ Este pago está pendiente</strong>
                        <p style="margin: 8px 0 0 0; color: #856404; font-size: 0.9rem;">
                            ¿Deseas marcarlo como pagado?
                        </p>
                    </div>
                ` : `
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 15px;">
                        <strong style="color: #155724;">✅ Este pago ya fue registrado</strong>
                        <p style="margin: 8px 0 0 0; color: #155724; font-size: 0.9rem;">
                            Pagado el ${formatearFecha(deuda.fechaPago)}
                        </p>
                    </div>
                `}
            </div>
        `,
        showCancelButton: true,
        showDenyButton: !deuda.pagado,
        confirmButtonText: deuda.pagado ? '🔁 Marcar como Pendiente' : '✅ Marcar como Pagado',
        denyButtonText: '✏️ Editar Pago',
        cancelButtonText: '❌ Cancelar',
        confirmButtonColor: deuda.pagado ? '#ffc107' : '#28a745',
        denyButtonColor: '#007bff',
        width: '600px',
        customClass: { container: 'swal-on-top' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            // Marcar como pagado o pendiente
            await togglePago(id, deuda.pagado);
            verificarNotificaciones();
        } else if (result.isDenied) {
            // Ir a editar
            irADeudas();
            setTimeout(() => {
                editarDeuda(id);
            }, 500);
        }
    });
}

function mostrarNotificacionToast(mensaje, tipo = 'info') {
    const colores = {
        success: '#28a745',
        warning: '#ffc107',
        danger: '#dc3545',
        info: '#17a2b8'
    };
    
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-white border-0';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        min-width: 300px;
        background-color: ${colores[tipo]};
    `;
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${mensaje}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 4000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// ============================================
// FUNCIONES ADICIONALES
// ============================================

async function verDeudasPorTipo() {
    try {
        const res = await fetch('/api/deudas/por-tipo');
        const data = await res.json();
        
        if (!data.success || !data.porTipo) {
            Swal.fire({
                icon: 'info',
                title: 'Sin Datos',
                text: 'No hay deudas para mostrar',
                customClass: { container: 'swal-on-top' }
            });
            return;
        }
        
        const porTipo = data.porTipo;
        let contenidoHTML = '<div style="text-align: left; max-height: 500px; overflow-y: auto;">';
        
        Object.keys(porTipo).forEach(tipo => {
            const items = porTipo[tipo];
            const total = items.reduce((sum, item) => sum + (item.monto || 0), 0);
            const pendientes = items.filter(i => !i.pagado).length;
            
            contenidoHTML += `
                <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h5 style="margin: 0; color: #333;">📋 ${tipo}</h5>
                        <span class="badge bg-primary">${items.length} pago${items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: #666; font-size: 0.9rem;">
                        <span>💰 Total: ${formatearMoneda(total)}</span>
                        <span>⏳ Pendientes: ${pendientes}</span>
                    </div>
                    <div style="margin-top: 10px;">
                        ${items.map(item => `
                            <div style="padding: 5px 0; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                                <span>${item.nombre}</span>
                                <span class="badge bg-${item.pagado ? 'success' : 'warning'}">${item.pagado ? '✅' : '⏳'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        contenidoHTML += '</div>';
        
        Swal.fire({
            title: '📊 Pagos por Tipo',
            html: contenidoHTML,
            width: '700px',
            showCloseButton: true,
            customClass: { container: 'swal-on-top' }
        });
        
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo cargar la información',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function agregarDeudasLote() {
    Swal.fire({
        title: '📦 Agregar Múltiples Pagos',
        html: `
            <div class="text-start" style="max-width: 600px; margin: 0 auto;">
                <p style="color: #666; margin-bottom: 15px;">
                    Formato: Nombre | Tipo | Día | Monto (uno por línea)
                    <br>
                    <small>Ejemplo: Renta | Arrendamiento | 5 | 5000</small>
                </p>
                <textarea id="lote-deudas" class="form-control" rows="10" placeholder="Renta | Arrendamiento | 5 | 5000
Luz CFE | Luz | 10 | 450
Internet | Internet | 15 | 599"></textarea>
            </div>
        `,
        confirmButtonText: '💾 Guardar Todos',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '700px',
        customClass: { container: 'swal-on-top' },
        preConfirm: () => {
            const texto = document.getElementById('lote-deudas').value.trim();
            if (!texto) {
                Swal.showValidationMessage('Ingresa al menos un pago');
                return false;
            }
            
            const lineas = texto.split('\n').filter(l => l.trim());
            const deudas = [];
            
            for (let i = 0; i < lineas.length; i++) {
                const partes = lineas[i].split('|').map(p => p.trim());
                if (partes.length < 4) {
                    Swal.showValidationMessage(`Error en línea ${i + 1}: formato incorrecto`);
                    return false;
                }
                
                deudas.push({
                    nombre: partes[0],
                    tipo: partes[1],
                    diaPago: parseInt(partes[2]),
                    monto: parseFloat(partes[3]),
                    notas: partes[4] || ''
                });
            }
            
            return deudas;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch('/api/deudas/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deudas: result.value })
                });
                const data = await res.json();
                
                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '✅ ¡Guardado!',
                        text: data.message,
                        timer: 2000,
                        customClass: { container: 'swal-on-top' }
                    });
                    cargarDeudas();
                    cargarResumenDeudas();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: '❌ Error',
                        text: data.error,
                        customClass: { container: 'swal-on-top' }
                    });
                }
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: '❌ Error',
                    text: 'No se pudieron guardar los pagos',
                    customClass: { container: 'swal-on-top' }
                });
            }
        }
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarDeudas();
    
    // Verificar notificaciones cada 30 minutos
    setInterval(verificarNotificaciones, 1800000);
    
    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('profile-dropdown');
        const profileIcon = document.getElementById('profile-icon');
        
        if (dropdown && profileIcon && !profileIcon.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    // Agregar estilos CSS para SweetAlert on top
    const style = document.createElement('style');
    style.textContent = `
        .swal-on-top {
            z-index: 99999 !important;
        }
        
        .deuda-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .deuda-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        
        .deuda-card-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .deuda-card-body {
            margin-bottom: 15px;
        }
        
        .deuda-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        
        .deuda-info-item {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        
        .deuda-label {
            font-size: 0.85rem;
            color: #666;
            font-weight: 500;
        }
        
        .deuda-value {
            font-size: 1.1rem;
            color: #333;
            font-weight: 600;
        }
        
        .deuda-notas {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 6px;
            font-size: 0.9rem;
            color: #555;
            border-left: 3px solid #007bff;
        }
        
        .deuda-card-footer {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .deudas-container {
            padding: 30px;
        }
        
        .deudas-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
        }
        
        .deudas-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        
        #resumen-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            margin-top: 3rem;
        }
        
        .stat-item {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.15);
            border-radius: 8px;
            backdrop-filter: blur(10px);
        }
        
        .stat-number {
            font-size: 1.8rem;
            font-weight: bold;
            color: white;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 0.85rem;
            color: rgba(255,255,255,0.9);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .profile-dropdown {
            display: none;
            position: absolute;
            top: 60px;
            right: 0;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            min-width: 250px;
            z-index: 1000;
        }
        
        .profile-dropdown.show {
            display: block;
        }
        
        .notification-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: #dc3545;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: bold;
        }
        
        @media (max-width: 768px) {
            .deudas-grid {
                grid-template-columns: 1fr;
            }
            
            .deuda-card-footer {
                flex-direction: column;
            }
            
            .deuda-card-footer .btn {
                width: 100%;
            }
            
            #resumen-stats {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `;
    document.head.appendChild(style);
});

// ============================================
// ESTILOS CSS PARA SELECT2
// ============================================
const select2Styles = `
/* Estilos para Select2 dentro de SweetAlert2 */
.select2-container {
    z-index: 99999 !important;
}

.select2-dropdown {
    z-index: 99999 !important;
    border: 1px solid #ddd;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.select2-container--default .select2-selection--single {
    border: 1px solid #ddd;
    border-radius: 5px;
    height: 38px;
    padding: 6px 12px;
}

.select2-container--default .select2-selection--single .select2-selection__rendered {
    line-height: 24px;
    color: #333;
}

.select2-container--default .select2-selection--single .select2-selection__arrow {
    height: 36px;
}

.select2-container--default .select2-results__option--highlighted[aria-selected] {
    background-color: #007bff;
}

.select2-search--dropdown .select2-search__field {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 6px 12px;
}

.select2-container--default .select2-results__option[aria-selected=true] {
    background-color: #f0f0f0;
}
`;

// Agregar estilos al documento si aún no existen
if (!document.getElementById('select2-custom-styles')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'select2-custom-styles';
    styleElement.textContent = select2Styles;
    document.head.appendChild(styleElement);
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