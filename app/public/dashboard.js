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

// ============================================
// CONFIGURACIONES GLOBALES
// ============================================
const BUSINESS_HOURS = {
    start: 8,
    end: 22,
    interval: 30
};

const MAX_APPOINTMENTS_PER_HOUR = 1;
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TOTAL_HOURS_PER_WEEK = 14 * 7;

// ============================================
// INICIALIZACIÓN - UN SOLO DOMContentLoaded
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Cargar datos iniciales
    await loadBotStatus();
    await loadClientes();
    await loadServicios();
    await loadAppointments();
    
    // Renderizar interfaz
    renderWeek();
    updateCalendarDisplay();
    updateAppointmentList();
    inicializarDeudas();
    verificarNotificaciones();
    
    // Configurar intervalos
    setInterval(loadBotStatus, 10000);
    setInterval(loadAppointments, 120000);
    setInterval(verificarNotificaciones, 3600000);
    
    // Event listeners globales
    document.addEventListener('click', (e) => {
        const profileMenu = document.getElementById('profile-dropdown');
        const profileIcon = document.getElementById('profile-icon');
        if (profileMenu && profileIcon && !profileMenu.contains(e.target) && !profileIcon.contains(e.target)) {
            profileMenu.classList.remove('show');
        }
    });
    
    // Event listeners para gastos
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const gastosPage = document.getElementById('gastos-page');
            if (gastosPage && gastosPage.classList.contains('active')) {
                cerrarGastos();
            }
        }
    });
    
    document.addEventListener('click', function(e) {
        const gastosPage = document.getElementById('gastos-page');
        if (e.target === gastosPage) {
            cerrarGastos();
        }
    });
    
    // Agregar estilos CSS
    agregarEstilosCSS();
});




// ============================================
// FUNCIONES DE CARGA
// ============================================
async function loadBotStatus() {
    try {
        const response = await fetch('/api/bot-status');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
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
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        appointments = data.map(apt => {
            const fecha = parseDate(apt.fecha, apt.hora);
            const duracion = apt.duracion || 60;
            
            return {
                ...apt,
                date: fecha,
                duracion: duracion,
                endTime: new Date(fecha.getTime() + duracion * 60000)
            };
        });

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
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        clientes = await response.json();
    } catch (error) {
        console.error('Error cargando clientes:', error);
        clientes = [];
    }
}

async function loadServicios() {
    try {
        const response = await fetch('/api/servicios');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
        
        return new Date(anio, mes - 1, dia, hora, minuto, 0);
    } catch (error) {
        console.error('Error parseando fecha:', error);
        return new Date();
    }
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

function obtenerEmojiCategoria(categoria) {
    const emojis = {
        'Comida': '🍔',
        'Transporte': '🚗',
        'Entretenimiento': '🎬',
        'Salud': '💊',
        'Educación': '📚',
        'Hogar': '🏠',
        'Ropa': '👕',
        'Servicios': '🔧',
        'Otros': '📦'
    };
    return emojis[categoria] || '💰';
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

function getAppointmentsForSlot(date, hour, minute = 0) {
    const slotStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0);
    const slotEnd = new Date(slotStart.getTime() + BUSINESS_HOURS.interval * 60000);
    
    return appointments.filter(apt => {
        if (!['Reservada', 'Confirmada', 'En Proceso', 'Finalizada'].includes(apt.status)) {
            return false;
        }
        
        const aptStart = apt.date;
        const aptEnd = apt.endTime;
        
        return !(aptEnd <= slotStart || aptStart >= slotEnd);
    });
}

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
        minutosOcupados += apt.duracion;
    });
    
    return Math.ceil(minutosOcupados / 60);
}

function getHoursAvailableInDay(date) {
    const HOURS_PER_DAY = BUSINESS_HOURS.end - BUSINESS_HOURS.start;
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

    document.getElementById('stat-available').textContent = totalAvailable;
    document.getElementById('stat-booked').textContent = totalBooked;
    document.getElementById('stat-occupancy').textContent = occupancy + '%';
    document.getElementById('stat-appointments').textContent = totalAppointments;
}

function createDayCard(date) {
    const dayOfWeek = DAYS[date.getDay()];
    const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    const HOURS_PER_DAY = BUSINESS_HOURS.end - BUSINESS_HOURS.start;
    const hoursOccupied = getHoursOccupiedInDay(date);
    const hoursAvailable = Math.max(0, HOURS_PER_DAY - hoursOccupied);

    const hoursHtml = [];

    for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
        for (let minute = 0; minute < 60; minute += BUSINESS_HOURS.interval) {
            const aptsInSlot = getAppointmentsForSlot(date, hour, minute);
            const isAvailable = aptsInSlot.length === 0;

            let slotClass = 'hour-slot';
            slotClass += isAvailable ? ' available' : ' fully-booked';

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

function handleHourClick(dateStr, hour, minute = 0) {
    const date = new Date(dateStr);
    const aptsInSlot = getAppointmentsForSlot(date, hour, minute);
    const isAvailable = aptsInSlot.length === 0;
    
    if (!isAvailable) {
        if (aptsInSlot.length === 1) {
            showAppointmentDetails(aptsInSlot[0].id);
        } else {
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

function showAppointmentDetails(appointmentId) {
    const apt = appointments.find(a => a.id === appointmentId || a.id === String(appointmentId));
    
    if (!apt) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Cita no encontrada',
            confirmButtonColor: '#667eea'
        });
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

function showNewAppointmentForm(dateStr, defaultHour = '') {
    console.log('🔍 showNewAppointmentForm llamada con:', { dateStr, defaultHour });

    function parseDateWithoutTimezone(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    let fecha = parseDateWithoutTimezone(dateStr);
    console.log('📅 Fecha procesada:', fecha);

    const fechaFormateada = `${fecha.getDate().toString().padStart(2, '0')}/${
        (fecha.getMonth() + 1).toString().padStart(2, '0')
    }/${fecha.getFullYear()}`;

    const clientesOptions = clientes
        .map(cliente => `<option value="${cliente.id}">${cliente.nombre} (${cliente.telefono})</option>`)
        .join('');

    const serviciosOptions = servicios
        .map(servicio => `<option value="${servicio.id}">${servicio.nombre} - ${servicio.precio} (${servicio.duracion}min)</option>`)
        .join('');

    const horasOptions = [];
    for (let hora = BUSINESS_HOURS.start; hora < BUSINESS_HOURS.end; hora++) {
        for (let minuto = 0; minuto < 60; minuto += BUSINESS_HOURS.interval) {
            const horaStr = `${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;
            const selected = defaultHour === horaStr ? 'selected' : '';
            horasOptions.push(`<option value="${horaStr}" ${selected}>${horaStr}</option>`);
        }
    }

    $('.select2-container').remove();
    
    setTimeout(() => {
        $(document).off('click.closeModal');
        $(document).off('mousedown.closeModal');
    }, 10);

    setTimeout(() => {
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
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        allowOutsideClick: false,
        allowEscapeKey: true,
        focusConfirm: false,
        didOpen: () => {
            console.log('✅ Modal abierto - inicializando Select2...');
            
            const popup = Swal.getPopup();
            
            if (popup) {
                popup.style.pointerEvents = 'auto';
            }
            
            setTimeout(() => {
                try {
                    // Cliente
                    if ($('#cliente').length && !$('#cliente').hasClass('select2-hidden-accessible')) {
                        $('#cliente').select2({
                            dropdownParent: popup ? $(popup) : $('.swal2-popup'),
                            placeholder: 'Buscar cliente...',
                            allowClear: true,
                            width: '100%',
                            language: {
                                noResults: function() { return "No se encontraron resultados"; },
                                searching: function() { return "Buscando..."; }
                            }
                        });
                        console.log('✅ Select2 de #cliente inicializado');
                    }

                    // Servicio
                    if ($('#servicio').length && !$('#servicio').hasClass('select2-hidden-accessible')) {
                        $('#servicio').select2({
                            dropdownParent: popup ? $(popup) : $('.swal2-popup'),
                            placeholder: 'Buscar servicio...',
                            allowClear: true,
                            width: '100%',
                            language: {
                                noResults: function() { return "No se encontraron resultados"; },
                                searching: function() { return "Buscando..."; }
                            }
                        });
                        console.log('✅ Select2 de #servicio inicializado');
                    }

                    // Hora
                    if ($('#hora').length && !$('#hora').hasClass('select2-hidden-accessible')) {
                        $('#hora').select2({
                            dropdownParent: popup ? $(popup) : $('.swal2-popup'),
                            placeholder: 'Seleccionar hora...',
                            allowClear: true,
                            width: '100%',
                            language: {
                                noResults: function() { return "No se encontraron resultados"; },
                                searching: function() { return "Buscando..."; }
                            }
                        });
                        console.log('✅ Select2 de #hora inicializado');
                    }
                } catch (e) {
                    console.error('❌ Error al inicializar Select2:', e);
                }
            }, 300);
        },
        preConfirm: () => {
            console.log('📝 Validando formulario...');
            
            const clienteId = document.getElementById('cliente').value;
            const servicioId = document.getElementById('servicio').value;
            const hora = document.getElementById('hora').value;
            const manicurista = document.getElementById('manicurista').value;
            const notas = document.getElementById('notas').value;

            console.log('Valores del formulario:', { clienteId, servicioId, hora, manicurista, notas });

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
            console.log('🔒 Cerrando modal - destruyendo Select2...');
            try {
                ['#cliente', '#servicio', '#hora'].forEach(selector => {
                    const element = $(selector);
                    if (element.length && element.hasClass('select2-hidden-accessible')) {
                        element.select2('destroy');
                        console.log(`✅ Select2 de ${selector} destruido`);
                    }
                });
            } catch (e) {
                console.warn('⚠️ Error al destruir Select2:', e);
            }
        }
    }).then(async (result) => {
        console.log('📊 Resultado del modal:', result);
        if (result.isConfirmed) {
            console.log('✅ Confirmado - creando cita...');
            await createNewAppointment(result.value);
        } else {
            console.log('❌ Cancelado');
        }
        }).catch(error => {
            console.error('❌ Error en SweetAlert:', error);
        });
    }, 100);

    console.log('🏁 Fin de showNewAppointmentForm');
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
                    await loadClientes();
                    
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
                    await loadServicios();
                    
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


// ============================================
// FUNCIONES DE PERFIL
// ============================================
function toggleProfileMenu() {
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('show');
}

function irADeudas() {
    document.getElementById('deudas-page').style.display = 'block'; // muestra el modal
    document.body.style.overflow = 'hidden'; // bloquea scroll del body
    document.getElementById('profile-dropdown').classList.remove('show'); // cierra dropdown
    cargarDeudas(); // carga contenido
    cargarResumenDeudas(); // carga resumen
}



function irAGastos() {
    const gastosPage = document.getElementById('gastos-page');
    if (gastosPage) {
        gastosPage.classList.add('active');
        gastosPage.removeAttribute('aria-hidden');
        document.body.style.overflow = 'hidden';
        cargarGastos();
    }
}

function cerrarGastos() {
    const gastosPage = document.getElementById('gastos-page');
    if (gastosPage) {
        gastosPage.classList.remove('active');
        gastosPage.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'auto';
    }
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
// FUNCIONES DE Notificaciones
// ============================================
// Verificar notificaciones de pagos próximos
async function verificarNotificaciones() {
    try {
        const res = await fetch('/api/deudas/notificaciones');
        const data = await res.json();
        
        if (data.success && data.notificaciones.length > 0) {
            mostrarNotificaciones(data.notificaciones);
        }
    } catch (error) {
        console.error('Error verificando notificaciones:', error);
    }
}

// Mostrar notificaciones en pantalla
function mostrarNotificaciones(notificaciones) {
    const contenedor = document.getElementById('notification-container') || crearContenedorNotificaciones();
    
    notificaciones.forEach((notif, index) => {
        setTimeout(() => {
            const notifElement = document.createElement('div');
            notifElement.className = `notification-item ${notif.urgente ? 'urgent' : ''}`;
            notifElement.innerHTML = `
                <div class="notification-icon">${notif.urgente ? '⚠️' : '🔔'}</div>
                <div class="notification-content">
                    <h6>${notif.titulo}</h6>
                    <p>${notif.mensaje}</p>
                    ${notif.monto ? `<small>Monto: $${notif.monto.toFixed(2)}</small>` : ''}
                </div>
            `;
            
            contenedor.appendChild(notifElement);
            
            // Auto-remover después de 10 segundos
            setTimeout(() => {
                notifElement.style.opacity = '0';
                setTimeout(() => notifElement.remove(), 300);
            }, 10000);
        }, index * 500);
    });
}

function crearContenedorNotificaciones() {
    const contenedor = document.createElement('div');
    contenedor.id = 'notification-container';
    contenedor.className = 'notification-container';
    document.body.appendChild(contenedor);
    return contenedor;
}


// ============================================
// FUNCIONES DE DEUDAS
// ============================================

// Función de inicialización
async function inicializarDeudas() {
    try {
        const res = await fetch('/api/deudas');
        const data = await res.json();
        if (data.success) {
            deudas = data.deudas || [];
            renderizarDeudas();
            verificarNotificaciones();
        }
    } catch (error) {
        console.error('Error inicializando deudas:', error);
    }
}


async function cargarDeudas() {
    const contenedor = document.getElementById('deudas-grid');
    if (!contenedor) return;
    
    contenedor.innerHTML = `
        <div class="deudas-loading">
            <div class="deudas-icon">💳</div>
            <h3>Cargando pagos...</h3>
        </div>
    `;

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
        cargarResumenDeudas();
    } catch (error) {
        console.error('Error cargando deudas:', error);
        contenedor.innerHTML = `
            <div class="deudas-loading">
                <div class="deudas-icon">❌</div>
                <h3>Error al cargar</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderizarDeudas() {
    const contenedor = document.getElementById('deudas-grid');
    if (!contenedor) return;

    if (deudas.length === 0) {
        contenedor.innerHTML = `
            <div class="deudas-loading">
                <div class="deudas-icon">💳</div>
                <h3>No hay pagos registrados</h3>
                <p>Comienza agregando tu primer pago</p>
                <button class="btn btn-success mt-3" onclick="agregarDeuda()">➕ Agregar Pago</button>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = deudas.map(deuda => {
        const hoy = new Date();
        const fechaPago = new Date(hoy.getFullYear(), hoy.getMonth(), deuda.diaPago);
        const diasRestantes = Math.ceil((fechaPago - hoy) / (1000 * 60 * 60 * 24));
        
        let claseEstado = '';
        let textoEstado = '';
        
        if (deuda.pagado) {
            claseEstado = 'pagado';
            textoEstado = '✅ Pagado';
        } else if (diasRestantes < 0) {
            claseEstado = 'urgente';
            textoEstado = `⚠️ Vencido hace ${Math.abs(diasRestantes)} días`;
        } else if (diasRestantes <= 3) {
            claseEstado = 'urgente';
            textoEstado = `🔴 Vence en ${diasRestantes} días`;
        } else if (diasRestantes <= 7) {
            claseEstado = 'proximo';
            textoEstado = `🟡 Vence en ${diasRestantes} días`;
        } else {
            textoEstado = `🟢 Vence en ${diasRestantes} días`;
        }

        return `
            <div class="deuda-card ${claseEstado}">
                <div class="deuda-header-card">
                    <h3 class="deuda-titulo">${deuda.nombre}</h3>
                    <span class="deuda-icono">💳</span>
                </div>
                <div class="deuda-info">
                    <div class="deuda-info-item">
                        <span class="deuda-info-label">Tipo:</span>
                        <span class="deuda-info-value">${deuda.tipo}</span>
                    </div>
                    <div class="deuda-info-item">
                        <span class="deuda-info-label">Monto:</span>
                        <span class="deuda-info-value">$${deuda.monto.toFixed(2)}</span>
                    </div>
                    <div class="deuda-info-item">
                        <span class="deuda-info-label">Día de pago:</span>
                        <span class="deuda-info-value">${deuda.diaPago}</span>
                    </div>
                </div>
                <div class="deuda-dias ${claseEstado}">
                    ${textoEstado}
                </div>
                ${deuda.notas ? `<div class="deuda-notas">${deuda.notas}</div>` : ''}
                <div class="deuda-acciones">
                    ${!deuda.pagado ? `<button class="btn-deuda btn-pagar" onclick="marcarPagado('${deuda.id}')">✅ Pagar</button>` : ''}
                    <button class="btn-deuda btn-editar" onclick="verHistorial('${deuda.id}')">📜 Historial</button>
                    <button class="btn-deuda btn-editar" onclick="editarDeuda('${deuda.id}')">✏️ Editar</button>
                    <button class="btn-deuda btn-eliminar" onclick="eliminarDeuda('${deuda.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function cargarResumenDeudas() {
    const totalDeudas = deudas.length;
    const totalPagadas = deudas.filter(d => d.pagado).length;
    const totalPendientes = totalDeudas - totalPagadas;
    const montoTotal = deudas.reduce((sum, d) => sum + d.monto, 0);
    const montoPendiente = deudas.filter(d => !d.pagado).reduce((sum, d) => sum + d.monto, 0);
    
    const hoy = new Date();
    const proximasVencer = deudas.filter(d => {
        if (d.pagado) return false;
        const fechaPago = new Date(hoy.getFullYear(), hoy.getMonth(), d.diaPago);
        const diasRestantes = Math.ceil((fechaPago - hoy) / (1000 * 60 * 60 * 24));
        return diasRestantes >= 0 && diasRestantes <= 7;
    }).length;

    const resumenContainer = document.getElementById('resumen-stats');
    if (resumenContainer) {
        resumenContainer.innerHTML = `
            <div class="stat-item">
                <div class="stat-number">${totalDeudas}</div>
                <div class="stat-label">Total Pagos</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${totalPagadas}</div>
                <div class="stat-label">Pagados</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${totalPendientes}</div>
                <div class="stat-label">Pendientes</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${proximasVencer}</div>
                <div class="stat-label">Por Vencer</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">$${montoTotal.toFixed(2)}</div>
                <div class="stat-label">Total</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">$${montoPendiente.toFixed(2)}</div>
                <div class="stat-label">Pendiente</div>
            </div>
        `;
    }
}

// Ver historial de pagos
async function verHistorial(id) {
    try {
        const res = await fetch(`/api/deudas/historial/${id}`);
        const data = await res.json();
        
        const deuda = deudas.find(d => d.id === id);
        
        if (data.success) {
            const historialHTML = data.historial.length > 0 
                ? data.historial.map(h => `
                    <div style="padding: 10px; margin: 5px 0; background: #f8f9fa; border-left: 3px solid #667eea; border-radius: 4px;">
                        <strong>📅 ${new Date(h.fecha).toLocaleDateString('es-MX', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                        })}</strong><br>
                        <span>💰 Monto: $${h.monto.toFixed(2)}</span><br>
                        ${h.notas ? `<small style="color: #666;">📝 ${h.notas}</small>` : ''}
                    </div>
                `).join('')
                : '<p style="text-align: center; color: #999; padding: 20px;">No hay historial de pagos</p>';
            
            Swal.fire({
                title: `📜 Historial: ${deuda.nombre}`,
                html: `
                    <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                        ${historialHTML}
                    </div>
                `,
                width: '600px',
                showCloseButton: true,
                customClass: { container: 'swal-on-top' }
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo cargar el historial',
            customClass: { container: 'swal-on-top' }
        });
    }
}

// Agregar una sola deuda
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

// Agregar múltiples deudas en lote
async function agregarDeudasLote() {
    Swal.fire({
        title: '📦 Agregar Varios Pagos',
        html: `
            <div style="text-align: left;">
                <p>Ingresa los pagos en formato CSV (uno por línea):</p>
                <p style="font-size: 0.85rem; color: #666;">
                    <strong>Formato:</strong> Nombre, Tipo, Día (1-31), Monto
                </p>
                <p style="font-size: 0.85rem; color: #666;">
                    <strong>Ejemplo:</strong><br>
                    Renta, Arrendamiento, 1, 5000<br>
                    Luz, Servicios, 15, 450<br>
                    Netflix, Entretenimiento, 10, 199
                </p>
                <textarea id="deudas-lote" class="swal2-textarea" rows="8" 
                    placeholder="Renta, Arrendamiento, 1, 5000&#10;Luz, Servicios, 15, 450" 
                    style="font-family: monospace;"></textarea>
            </div>
        `,
        confirmButtonText: '💾 Guardar Todos',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '700px',
        customClass: { container: 'swal-on-top' },
        preConfirm: () => {
            const texto = document.getElementById('deudas-lote').value.trim();
            if (!texto) {
                Swal.showValidationMessage('Ingresa al menos un pago');
                return false;
            }
            
            const lineas = texto.split('\n').filter(l => l.trim());
            const pagos = [];
            
            for (let i = 0; i < lineas.length; i++) {
                const partes = lineas[i].split(',').map(p => p.trim());
                if (partes.length < 4) {
                    Swal.showValidationMessage(`Error en línea ${i + 1}: formato incorrecto`);
                    return false;
                }
                
                const diaPago = parseInt(partes[2]);
                if (diaPago < 1 || diaPago > 31) {
                    Swal.showValidationMessage(`Error en línea ${i + 1}: día debe estar entre 1 y 31`);
                    return false;
                }
                
                pagos.push({
                    nombre: partes[0],
                    tipo: partes[1],
                    diaPago: diaPago,
                    monto: parseFloat(partes[3]),
                    notas: partes[4] || ''
                });
            }
            
            return pagos;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const res = await fetch('/api/deudas/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deudas: result.value })
            });
            const data = await res.json();
            
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '✅ ¡Guardado!',
                    text: `${data.total} pagos agregados correctamente`,
                    timer: 2000,
                    customClass: { container: 'swal-on-top' }
                });
                cargarDeudas();
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

// Ver deudas por tipo
async function verDeudasPorTipo() {
    try {
        const tiposUnicos = [...new Set(deudas.map(d => d.tipo))];
        
        if (tiposUnicos.length === 0) {
            Swal.fire({
                icon: 'info',
                title: '📊 Sin Tipos',
                text: 'No hay pagos registrados aún',
                customClass: { container: 'swal-on-top' }
            });
            return;
        }

        const deudasPorTipo = {};
        tiposUnicos.forEach(tipo => {
            const deudasTipo = deudas.filter(d => d.tipo === tipo);
            deudasPorTipo[tipo] = {
                cantidad: deudasTipo.length,
                monto: deudasTipo.reduce((sum, d) => sum + d.monto, 0),
                pendientes: deudasTipo.filter(d => !d.pagado).length
            };
        });

        const html = `
            <div style="text-align: left;">
                ${Object.keys(deudasPorTipo).map(tipo => {
                    const data = deudasPorTipo[tipo];
                    return `
                        <div class="tipo-item-modal" onclick="filtrarPorTipo('${tipo}'); Swal.close();" 
                            style="display: flex; align-items: center; gap: 1rem; padding: 1rem; margin: 0.5rem 0; 
                            background: #f8f9fa; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='#e9ecef'; this.style.transform='translateX(5px)';"
                            onmouseout="this.style.background='#f8f9fa'; this.style.transform='translateX(0)';">
                            <span style="font-size: 2rem;">📋</span>
                            <div style="flex: 1;">
                                <strong style="display: block; color: #333; margin-bottom: 0.25rem;">${tipo}</strong>
                                <p style="margin: 0; color: #666; font-size: 0.9rem;">
                                    ${data.cantidad} pagos - $${data.monto.toFixed(2)} - ${data.pendientes} pendientes
                                </p>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        Swal.fire({
            title: '📊 Pagos por Tipo',
            html: html,
            width: '700px',
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { container: 'swal-on-top' }
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo cargar el resumen',
            customClass: { container: 'swal-on-top' }
        });
    }
}

// Filtrar por tipo
function filtrarPorTipo(tipo) {
    const deudasFiltradas = deudas.filter(d => d.tipo === tipo);
    const contenedor = document.getElementById('deudas-grid');
    
    // Usar la función renderizarDeudas pero con datos filtrados
    const deudasBackup = [...deudas];
    deudas = deudasFiltradas;
    renderizarDeudas();
    
    // Agregar botón para ver todos
    const btnVerTodos = document.createElement('div');
    btnVerTodos.style.gridColumn = '1 / -1';
    btnVerTodos.style.textAlign = 'center';
    btnVerTodos.style.marginTop = '20px';
    btnVerTodos.innerHTML = `
        <button class="btn btn-secondary" onclick="deudas = ${JSON.stringify(deudasBackup)}; renderizarDeudas(); cargarResumenDeudas();">
            🔙 Ver Todos los Pagos
        </button>
    `;
    contenedor.appendChild(btnVerTodos);
    
    Swal.close();
}

// Resetear todos los pagos del mes
async function resetearPagos() {
    const result = await Swal.fire({
        title: '🔄 Resetear Pagos',
        text: '¿Deseas marcar todos los pagos como NO pagados? (útil al inicio de mes)',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, resetear',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ffc107',
        customClass: { container: 'swal-on-top' }
    });
    
    if (!result.isConfirmed) return;

    try {
        const res = await fetch('/api/deudas/resetear-pagos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '✅ Reseteado',
                text: 'Todos los pagos marcados como pendientes',
                timer: 2000,
                customClass: { container: 'swal-on-top' }
            });
            cargarDeudas();
        } else {
            Swal.fire({
                icon: 'error',
                title: '❌ Error',
                text: data.error || 'No se pudo resetear',
                customClass: { container: 'swal-on-top' }
            });
        }
    } catch (error) {
        console.error('Error reseteando pagos:', error);
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo conectar con el servidor',
            customClass: { container: 'swal-on-top' }
        });
    }
}


// Marcar como pagado
async function marcarPagado(id) {
    try {
        const res = await fetch(`/api/deudas/${id}/pagar`, {
            method: 'POST',  // ✅ Cambiado a POST
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pagado: true }) // enviamos el body
        });

        // Manejo de errores HTTP antes de parsear JSON
        if (!res.ok) {
            if (res.status === 404) {
                Swal.fire({
                    icon: 'error',
                    title: '❌ Deuda no encontrada',
                    text: 'No se encontró la deuda que intentas pagar',
                    customClass: { container: 'swal-on-top' }
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: '❌ Error del servidor',
                    text: `Código ${res.status}: ${res.statusText}`,
                    customClass: { container: 'swal-on-top' }
                });
            }
            return;
        }

        const data = await res.json();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '✅ ¡Pagado!',
                text: data.message || 'Pago marcado como realizado',
                timer: 2000,
                customClass: { container: 'swal-on-top' }
            });
            cargarDeudas(); // refresca lista
        } else {
            Swal.fire({
                icon: 'error',
                title: '❌ Error',
                text: data.error || 'No se pudo marcar como pagado',
                customClass: { container: 'swal-on-top' }
            });
        }

    } catch (error) {
        console.error('Error marcando como pagado:', error);
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'Ocurrió un error inesperado',
            customClass: { container: 'swal-on-top' }
        });
    }
}


// Editar deuda
async function editarDeuda(id) {
    try {
        const deuda = deudas.find(d => d.id === id);
        if (!deuda) return;

        const tipos = ['Arrendamiento','Luz','Agua','Internet','Teléfono','Gas','Tarjeta de Crédito 1','Tarjeta de Crédito 2','Netflix','Spotify','Gimnasio','Seguro','Otro'];
        const opcionesTipo = tipos.map(t => `<option value="${t}" ${deuda.tipo === t ? 'selected' : ''}>${t}</option>`).join('');

        Swal.fire({
            title: '✏️ Editar Pago',
            html: `
                <div class="text-start" style="max-width: 500px; margin: 0 auto;">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Nombre del Pago *</label>
                        <input type="text" id="nombre-deuda" class="form-control" value="${deuda.nombre}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Tipo de Pago *</label>
                        <select id="tipo-deuda" class="form-control">
                            ${opcionesTipo}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Día de Pago (1-31) *</label>
                        <input type="number" id="dia-pago" class="form-control" min="1" max="31" value="${deuda.diaPago}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Monto *</label>
                        <input type="number" id="monto-deuda" class="form-control" step="0.01" value="${deuda.monto}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Notas (opcional)</label>
                        <textarea id="notas-deuda" class="form-control" rows="2">${deuda.notas || ''}</textarea>
                    </div>
                </div>
            `,
            confirmButtonText: '💾 Guardar Cambios',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            width: '600px',
            customClass: { container: 'swal-on-top' },
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
    } catch (error) {
        console.error('Error editando deuda:', error);
    }
}

// Eliminar deuda
async function eliminarDeuda(id) {
    const result = await Swal.fire({
        title: '🗑️ Eliminar Pago',
        text: '¿Seguro que deseas eliminar este pago? Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545',
        customClass: { container: 'swal-on-top' }
    });
    
    if (!result.isConfirmed) return;

    try {
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
        } else {
            Swal.fire({
                icon: 'error',
                title: '❌ Error',
                text: data.error || 'No se pudo eliminar',
                customClass: { container: 'swal-on-top' }
            });
        }
    } catch (error) {
        console.error('Error eliminando deuda:', error);
    }
}

// Ver resumen
async function verResumenDeudas() {
    cargarResumenDeudas();
    
    const totalDeudas = deudas.length;
    const totalPagadas = deudas.filter(d => d.pagado).length;
    const totalPendientes = totalDeudas - totalPagadas;
    const montoTotal = deudas.reduce((sum, d) => sum + d.monto, 0);
    const montoPendiente = deudas.filter(d => !d.pagado).reduce((sum, d) => sum + d.monto, 0);
    
    Swal.fire({
        title: '📊 Resumen de Pagos',
        html: `
            <div style="text-align: left;">
                <div class="mb-3 p-3" style="background: #f8f9fa; border-radius: 8px;">
                    <h5>📈 Estadísticas Generales</h5>
                    <p><strong>Total de pagos:</strong> ${totalDeudas}</p>
                    <p><strong>Pagados:</strong> ${totalPagadas}</p>
                    <p><strong>Pendientes:</strong> ${totalPendientes}</p>
                </div>
                <div class="p-3" style="background: #e8f4f8; border-radius: 8px;">
                    <h5>💰 Montos</h5>
                    <p><strong>Total:</strong> $${montoTotal.toFixed(2)}</p>
                    <p><strong>Pendiente:</strong> $${montoPendiente.toFixed(2)}</p>
                </div>
            </div>
        `,
        width: '600px',
        customClass: { container: 'swal-on-top' }
    });
}

async function exportarDeudas() {
    try {
        if (deudas.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin Datos',
                text: 'No hay pagos para exportar',
                customClass: { container: 'swal-on-top' }
            });
            return;
        }

        const csv = [
            ['Nombre', 'Tipo', 'Monto', 'Día de Pago', 'Estado', 'Notas'].join(','),
            ...deudas.map(d => 
                [
                    `"${d.nombre}"`,
                    `"${d.tipo}"`,
                    d.monto,
                    d.diaPago,
                    d.pagado ? 'Pagado' : 'Pendient',
                    `"${d.notas || ''}"`
                ].join(',')
            )
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pagos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        Swal.fire({
            icon: 'success',
            title: '✅ Exportado',
            text: 'Pagos exportados correctamente',
            timer: 2000,
            customClass: { container: 'swal-on-top' }
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudieron exportar los pagos',
            customClass: { container: 'swal-on-top' }
        });
    }
}

function openDeudas() {
    const modal = document.getElementById('deudas-page');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // bloquea scroll del body
    modal.style.opacity = 0; // inicio de animación
    requestAnimationFrame(() => {
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = 1;
    });
    cargarDeudas(); // tu función para llenar contenido
}

// Cerrar modal con fade-out
function cerrarDeudas() {
    const modal = document.getElementById('deudas-page');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}
// Cerrar modal si se clickea fuera del contenido
document.getElementById('deudas-page').addEventListener('click', e => {
    if (e.target.id === 'deudas-page') cerrarDeudas();
});

// ============================================
// FUNCIONES DE GASTOS
// ============================================
async function cargarGastos() {
    try {
        const response = await fetch('/api/gastos');
        const data = await response.json();

        if (data.success) {
            mostrarGastos(data.gastos);
            cargarResumenGastos();
        }
    } catch (error) {
        console.error('Error al cargar gastos:', error);
    }
}

async function cargarResumenGastos() {
    try {
        const response = await fetch('/api/gastos/resumen');
        const data = await response.json();

        if (data.success) {
            const resumen = data.resumen;
            document.querySelector('#resumen-gastos-stats').innerHTML = `
                <div class="stat-item">
                    <div class="stat-number">${resumen.totalGastos}</div>
                    <div class="stat-label">Total Gastos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-primary">${resumen.gastosMes}</div>
                    <div class="stat-label">Este Mes</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-info">${resumen.gastosSemana}</div>
                    <div class="stat-label">Esta Semana</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-success">${resumen.gastosHoy}</div>
                    <div class="stat-label">Hoy</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">$${resumen.totalMonto}</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number text-warning">$${resumen.promedioDiario}</div>
                    <div class="stat-label">Promedio Diario</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar resumen:', error);
    }
}

function mostrarGastos(gastos) {
    const gastosGrid = document.getElementById('gastos-grid');
    
    if (!gastos || gastos.length === 0) {
        gastosGrid.innerHTML = `
            <div class="gastos-loading">
                <div class="gastos-icon">💰</div>
                <h3>No hay gastos registrados</h3>
                <p>Comienza agregando tu primer gasto</p>
                <button class="btn btn-success mt-3" onclick="agregarGasto()">➕ Agregar Gasto</button>
            </div>
        `;
        return;
    }

    gastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    gastosGrid.innerHTML = gastos.map(gasto => {
        const categoriaEmoji = obtenerEmojiCategoria(gasto.categoria);
        return `
            <div class="gasto-card">
                <div class="gasto-header">
                    <div class="gasto-categoria">
                        <span class="categoria-emoji">${categoriaEmoji}</span>
                        <span class="categoria-nombre">${gasto.categoria}</span>
                    </div>
                    <div class="gasto-monto">$${parseFloat(gasto.monto).toFixed(2)}</div>
                </div>
                <div class="gasto-body">
                    <h5>${gasto.descripcion}</h5>
                    <p class="gasto-fecha">📅 ${formatearFecha(gasto.fecha)}</p>
                    ${gasto.notas ? `<p class="gasto-notas">${gasto.notas}</p>` : ''}
                </div>
                <div class="gasto-footer">
                    <button class="btn btn-sm btn-primary" onclick="editarGasto('${gasto.id}')">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarGasto('${gasto.id}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
    }).join('');
}
function agregarGasto() {
    Swal.fire({
        title: '💰 Agregar Gasto',
        html: `
            <div style="text-align: left;">
                <label for="gasto-descripcion">Descripción:</label>
                <input id="gasto-descripcion" class="swal2-input" placeholder="Ej: Comida, Gasolina, etc.">
                
                <label for="gasto-monto">Monto:</label>
                <input id="gasto-monto" type="number" step="0.01" class="swal2-input" placeholder="0.00">
                
                <label for="gasto-categoria">Categoría:</label>
                <select id="gasto-categoria" class="swal2-select">
                    <option value="">Selecciona una categoría</option>
                    <option value="Comida">🍔 Comida</option>
                    <option value="Transporte">🚗 Transporte</option>
                    <option value="Entretenimiento">🎬 Entretenimiento</option>
                    <option value="Salud">💊 Salud</option>
                    <option value="Educación">📚 Educación</option>
                    <option value="Hogar">🏠 Hogar</option>
                    <option value="Ropa">👕 Ropa</option>
                    <option value="Servicios">🔧 Servicios</option>
                    <option value="Otros">📦 Otros</option>
                </select>
                
                <label for="gasto-fecha">Fecha:</label>
                <input id="gasto-fecha" type="date" class="swal2-input" value="${new Date().toISOString().split('T')[0]}">
                
                <label for="gasto-notas">Notas (opcional):</label>
                <textarea id="gasto-notas" class="swal2-textarea" placeholder="Notas adicionales"></textarea>
            </div>
        `,
        confirmButtonText: '💾 Guardar Gasto',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '600px',
        customClass: {
            container: 'swal-on-top'
        },
        preConfirm: () => {
            const descripcion = document.getElementById('gasto-descripcion').value.trim();
            const monto = parseFloat(document.getElementById('gasto-monto').value || 0);
            const categoria = document.getElementById('gasto-categoria').value;
            const fecha = document.getElementById('gasto-fecha').value;
            const notas = document.getElementById('gasto-notas').value.trim();

            if (!descripcion || !categoria || !monto) {
                Swal.showValidationMessage('Por favor completa todos los campos obligatorios');
                return false;
            }

            if (monto <= 0) {
                Swal.showValidationMessage('El monto debe ser mayor a 0');
                return false;
            }

            return { descripcion, monto, categoria, fecha, notas };
        }
    }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await fetch('/api/gastos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            });
            const data = await res.json();
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '✅ ¡Guardado!',
                    text: 'Gasto agregado exitosamente',
                    timer: 2000,
                    customClass: { container: 'swal-on-top' }
                });
                cargarGastos();
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

function agregarGastosLote() {
    Swal.fire({
        title: '📦 Agregar Varios Gastos',
        html: `
            <div style="text-align: left;">
                <p>Ingresa los gastos en formato CSV (uno por línea):</p>
                <p style="font-size: 0.85rem; color: #666;">
                    <strong>Formato:</strong> Descripción, Monto, Categoría, Fecha (YYYY-MM-DD)
                </p>
                <p style="font-size: 0.85rem; color: #666;">
                    <strong>Ejemplo:</strong><br>
                    Comida restaurante, 250.50, Comida, 2025-10-25<br>
                    Gasolina, 500.00, Transporte, 2025-10-25
                </p>
                <textarea id="gastos-lote" class="swal2-textarea" rows="8" 
                    placeholder="Comida restaurante, 250.50, Comida, 2025-10-25&#10;Gasolina, 500.00, Transporte, 2025-10-25" 
                    style="font-family: monospace;"></textarea>
            </div>
        `,
        confirmButtonText: '💾 Guardar Todos',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        width: '700px',
        customClass: { container: 'swal-on-top' },
        preConfirm: () => {
            const texto = document.getElementById('gastos-lote').value.trim();
            if (!texto) {
                Swal.showValidationMessage('Ingresa al menos un gasto');
                return false;
            }
            
            const lineas = texto.split('\n').filter(l => l.trim());
            const gastos = [];
            
            for (let i = 0; i < lineas.length; i++) {
                const partes = lineas[i].split(',').map(p => p.trim());
                if (partes.length < 3) {
                    Swal.showValidationMessage(`Error en línea ${i + 1}: formato incorrecto`);
                    return false;
                }
                
                gastos.push({
                    descripcion: partes[0],
                    monto: parseFloat(partes[1]),
                    categoria: partes[2],
                    fecha: partes[3] || new Date().toISOString().split('T')[0],
                    notas: partes[4] || ''
                });
            }
            
            return gastos;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const res = await fetch('/api/gastos/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gastos: result.value })
            });
            const data = await res.json();
            
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '✅ ¡Guardado!',
                    text: `${data.total} gastos agregados correctamente`,
                    timer: 2000,
                    customClass: { container: 'swal-on-top' }
                });
                cargarGastos();
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

async function editarGasto(id) {
    try {
        const response = await fetch('/api/gastos');
        const data = await response.json();
        const gasto = data.gastos.find(g => g.id === id);

        if (!gasto) return;

        Swal.fire({
            title: '✏️ Editar Gasto',
            html: `
                <div style="text-align: left;">
                    <label for="edit-descripcion">Descripción:</label>
                    <input id="edit-descripcion" class="swal2-input" value="${gasto.descripcion}">
                    
                    <label for="edit-monto">Monto:</label>
                    <input id="edit-monto" type="number" step="0.01" class="swal2-input" value="${gasto.monto}">
                    
                    <label for="edit-categoria">Categoría:</label>
                    <select id="edit-categoria" class="swal2-select">
                        <option value="Comida" ${gasto.categoria === 'Comida' ? 'selected' : ''}>🍔 Comida</option>
                        <option value="Transporte" ${gasto.categoria === 'Transporte' ? 'selected' : ''}>🚗 Transporte</option>
                        <option value="Entretenimiento" ${gasto.categoria === 'Entretenimiento' ? 'selected' : ''}>🎬 Entretenimiento</option>
                        <option value="Salud" ${gasto.categoria === 'Salud' ? 'selected' : ''}>💊 Salud</option>
                        <option value="Educación" ${gasto.categoria === 'Educación' ? 'selected' : ''}>📚 Educación</option>
                        <option value="Hogar" ${gasto.categoria === 'Hogar' ? 'selected' : ''}>🏠 Hogar</option>
                        <option value="Ropa" ${gasto.categoria === 'Ropa' ? 'selected' : ''}>👕 Ropa</option>
                        <option value="Servicios" ${gasto.categoria === 'Servicios' ? 'selected' : ''}>🔧 Servicios</option>
                        <option value="Otros" ${gasto.categoria === 'Otros' ? 'selected' : ''}>📦 Otros</option>
                    </select>
                    
                    <label for="edit-fecha">Fecha:</label>
                    <input id="edit-fecha" type="date" class="swal2-input" value="${gasto.fecha}">
                    
                    <label for="edit-notas">Notas:</label>
                    <textarea id="edit-notas" class="swal2-textarea">${gasto.notas || ''}</textarea>
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
                descripcion: document.getElementById('edit-descripcion').value.trim(),
                monto: parseFloat(document.getElementById('edit-monto').value || 0),
                categoria: document.getElementById('edit-categoria').value,
                fecha: document.getElementById('edit-fecha').value,
                notas: document.getElementById('edit-notas').value.trim()
            })
        }).then(async (r) => {
            if (r.isConfirmed) {
                const res = await fetch(`/api/gastos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(r.value)
                });
                const data = await res.json();
                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '✅ Actualizado',
                        text: 'Gasto modificado exitosamente',
                        timer: 2000,
                        customClass: { container: 'swal-on-top' }
                    });
                    cargarGastos();
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
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo editar el gasto',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function eliminarGasto(id) {
    const result = await Swal.fire({
        title: '🗑️ Eliminar Gasto',
        text: '¿Seguro que deseas eliminar este gasto? Esta acción no se puede deshacer.',
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

    const res = await fetch(`/api/gastos/${id}`, { method: 'DELETE' });
    const data = await res.json();
    
    if (data.success) {
        Swal.fire({
            icon: 'success',
            title: '✅ Eliminado',
            text: 'Gasto eliminado exitosamente',
            timer: 2000,
            customClass: { container: 'swal-on-top' }
        });
        cargarGastos();
    } else {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: data.error || 'No se pudo eliminar',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function verGastosPorCategoria() {
    try {
        const response = await fetch('/api/gastos/resumen');
        const data = await response.json();

        if (data.success) {
            const categorias = data.resumen.gastosPorCategoria;
            
            if (Object.keys(categorias).length === 0) {
                Swal.fire({
                    icon: 'info',
                    title: '📊 Sin Categorías',
                    text: 'No hay gastos registrados aún',
                    customClass: { container: 'swal-on-top' }
                });
                return;
            }

            const html = `
                <div style="text-align: left;">
                    ${Object.keys(categorias).map(cat => {
                        const emoji = obtenerEmojiCategoria(cat);
                        const porcentaje = ((categorias[cat].monto / data.resumen.totalMonto) * 100).toFixed(1);
                        return `
                            <div class="categoria-item-modal" onclick="filtrarPorCategoria('${cat}'); Swal.close();" 
                                style="display: flex; align-items: center; gap: 1rem; padding: 1rem; margin: 0.5rem 0; 
                                background: #f8f9fa; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='#e9ecef'; this.style.transform='translateX(5px)';"
                                onmouseout="this.style.background='#f8f9fa'; this.style.transform='translateX(0)';">
                                <span style="font-size: 2rem;">${emoji}</span>
                                <div style="flex: 1;">
                                    <strong style="display: block; color: #333; margin-bottom: 0.25rem;">${cat}</strong>
                                    <p style="margin: 0; color: #666; font-size: 0.9rem;">
                                        ${categorias[cat].cantidad} gastos - $${categorias[cat].monto.toFixed(2)} (${porcentaje}%)
                                    </p>
                                    <div style="background: #e0e0e0; height: 6px; border-radius: 3px; margin-top: 0.5rem; overflow: hidden;">
                                        <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${porcentaje}%;"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            Swal.fire({
                title: '📊 Gastos por Categoría',
                html: html,
                width: '700px',
                showConfirmButton: false,
                showCloseButton: true,
                customClass: { container: 'swal-on-top' }
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudo cargar el resumen',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function exportarGastos() {
    try {
        const response = await fetch('/api/gastos');
        const data = await response.json();

        if (data.success && data.gastos.length > 0) {
            const csv = [
                ['Descripción', 'Monto', 'Categoría', 'Fecha', 'Notas'].join(','),
                ...data.gastos.map(g => 
                    [
                        `"${g.descripcion}"`,
                        g.monto,
                        `"${g.categoria}"`,
                        g.fecha,
                        `"${g.notas || ''}"`
                    ].join(',')
                )
            ].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gastos_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            Swal.fire({
                icon: 'success',
                title: '✅ Exportado',
                text: 'Gastos exportados correctamente',
                timer: 2000,
                customClass: { container: 'swal-on-top' }
            });
        } else {
            Swal.fire({
                icon: 'info',
                title: 'Sin Datos',
                text: 'No hay gastos para exportar',
                customClass: { container: 'swal-on-top' }
            });
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudieron exportar los gastos',
            customClass: { container: 'swal-on-top' }
        });
    }
}

async function filtrarPorCategoria(categoria) {
    try {
        const response = await fetch(`/api/gastos/categoria/${categoria}`);
        const data = await response.json();

        if (data.success) {
            mostrarGastos(data.gastos);
            
            const gastosGrid = document.getElementById('gastos-grid');
            const btnVerTodos = document.createElement('div');
            btnVerTodos.className = 'text-center mt-3';
            btnVerTodos.innerHTML = `
                <button class="btn btn-secondary" onclick="cargarGastos()">
                    🔙 Ver Todos los Gastos
                </button>
            `;
            gastosGrid.appendChild(btnVerTodos);
            
            Swal.close();
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: '❌ Error',
            text: 'No se pudieron filtrar los gastos',
            customClass: { container: 'swal-on-top' }
        });
    }
}
// ============================================
// FUNCIÓN PARA AGREGAR ESTILOS CSS
// ============================================
function agregarEstilosCSS() {
    if (document.getElementById('dashboard-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.textContent = `
        .swal-on-top {
            z-index: 99999 !important;
        }
        
        .deuda-card, .gasto-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .deuda-card:hover, .gasto-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        
        .deuda-card-header, .gasto-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .deuda-card-body, .gasto-body {
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
        
        .deuda-notas, .gasto-notas {
        background: #f8f9fa;
    padding: 10px;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #555;
    border-left: 3px solid #007bff;
    margin: 10px 0;
        }
        
        .deuda-card-footer, .gasto-footer {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .deudas-container, .gastos-container {
            padding: 30px;
        }
        
        .deudas-grid, .gastos-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }
        
        #resumen-stats, #resumen-gastos-stats {
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
            color: rgba(255, 255, 255, 0.9);
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
            .deudas-grid, .gastos-grid {
                grid-template-columns: 1fr;
            }
            
            .deuda-card-footer, .gasto-footer {
                flex-direction: column;
            }
            
            .deuda-card-footer .btn, .gasto-footer .btn {
                width: 100%;
            }
            
            #resumen-stats, #resumen-gastos-stats {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `;
    document.head.appendChild(style);
    
    // Estilos de Select2
    if (!document.getElementById('select2-custom-styles')) {
        const select2Style = document.createElement('style');
        select2Style.id = 'select2-custom-styles';
        select2Style.textContent = `
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
        document.head.appendChild(select2Style);
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