 // ============================================
        // VARIABLES GLOBALES
        // ============================================
        let currentDate = new Date();
        let selectedDate = new Date();
        let currentWeekStart = getMonday(new Date());
        let appointments = [];
        let clientes = [];
        let servicios = [];

        const BUSINESS_HOURS = {
            start: 8,
            end: 22,
            interval: 30
        };

        const MAX_APPOINTMENTS_PER_HOUR = 3;
        const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // ============================================
        // INICIALIZACIÓN
        // ============================================
        document.addEventListener('DOMContentLoaded', async () => {
            await loadBotStatus();
            await loadAppointments();
            await loadClientes();
            await loadServicios();
            
            renderWeek();
            updateCalendarDisplay();
            updateAppointmentList();
            
            setInterval(loadBotStatus, 10000);
            setInterval(loadAppointments, 120000);
        });

        // ============================================
        // FUNCIONES DE CARGA
        // ============================================
        async function loadBotStatus() {
            try {
                const response = await fetch('/api/bot-status');
                const data = await response.json();
                
                const statusElement = document.getElementById('bot-status');
                statusElement.textContent = data.isConnected ? '✅ Conectado' : '❌ Desconectado';
                statusElement.className = `status ${data.isConnected ? 'text-success' : 'text-danger'}`;
                
                document.getElementById('chats-activos').textContent = data.chatsActivos;
                document.getElementById('mensajes-enviados').textContent = data.mensajesEnviados;
                document.getElementById('mensajes-recibidos').textContent = data.mensajesRecibidos;
                
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
                renderWeek();
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

       function parseDate(fechaStr, horaStr) {
    try {
        // Formato esperado: "DD/MM/YYYY" y "HH:MM"
        const [dia, mes, anio] = fechaStr.split('/').map(num => parseInt(num, 10));
        const [hora, minuto] = horaStr.split(':').map(num => parseInt(num, 10));
        
        // Validar que todos los valores sean números válidos
        if (isNaN(dia) || isNaN(mes) || isNaN(anio) || isNaN(hora) || isNaN(minuto)) {
            console.error('Fecha inválida:', fechaStr, horaStr);
            return new Date();
        }
        
        // IMPORTANTE: Crear la fecha usando UTC para evitar problemas de zona horaria
        // Mes - 1 porque en JavaScript los meses van de 0 a 11
        const fecha = new Date(anio, mes - 1, dia, hora, minuto, 0);
        
        console.log(`📅 Fecha parseada: ${fechaStr} ${horaStr} -> ${fecha.toString()}`);
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

        function getAppointmentsForSlot(date, hour) {
            return appointments.filter(apt => {
                const aptDate = apt.date;
                return aptDate.getFullYear() === date.getFullYear() &&
                       aptDate.getMonth() === date.getMonth() &&
                       aptDate.getDate() === date.getDate() &&
                       aptDate.getHours() === hour;
            });
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

            let availableCount = 0;
            let bookedCount = 0;
            let appointmentCount = 0;

            const hoursHtml = [];

            for (let hour = BUSINESS_HOURS.start; hour < BUSINESS_HOURS.end; hour++) {
                const aptsInHour = getAppointmentsForSlot(date, hour);
                const slots = BUSINESS_HOURS.interval === 30 ? 2 : 1;
                const maxCapacity = MAX_APPOINTMENTS_PER_HOUR * slots;
                const isAvailable = aptsInHour.length < maxCapacity;

                if (isAvailable) availableCount++;
                else bookedCount++;
                appointmentCount += aptsInHour.length;

                const percentage = Math.round((aptsInHour.length / maxCapacity) * 100);
                let slotClass = 'hour-slot';

                if (aptsInHour.length === 0) {
                    slotClass += ' available';
                } else if (aptsInHour.length >= maxCapacity) {
                    slotClass += ' fully-booked';
                } else {
                    slotClass += ' booked';
                }

                const hourStr = `${hour.toString().padStart(2, '0')}:00`;

                hoursHtml.push(`
                    <div class="${slotClass}" onclick="handleHourClick('${date.toISOString().split('T')[0]}', ${hour})">
                        <div class="hour-time">${hourStr}</div>
                        <div class="hour-availability">
                            <div class="availability-bar">
                                <div class="availability-fill" style="width: ${percentage}%"></div>
                            </div>
                            <span class="availability-text">${aptsInHour.length}/${maxCapacity}</span>
                        </div>
                    </div>
                `);
            }

            const isToday = date.toDateString() === new Date().toDateString();

            const dayCardHtml = `
                <div class="day-card">
                    <div class="day-header" style="${isToday ? 'background: linear-gradient(135deg, #28a745 0%, #20c997 100%);' : ''}">
                        <h3>${dayOfWeek} ${isToday ? '(Hoy)' : ''}</h3>
                        <p>${dateStr}</p>
                    </div>
                    <div class="day-status status-open">08:00 - 22:00</div>
                    <div class="hours-container">${hoursHtml.join('')}</div>
                </div>
            `;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = dayCardHtml;

            return {
                element: tempDiv.firstElementChild,
                stats: {
                    available: availableCount,
                    booked: bookedCount,
                    appointments: appointmentCount
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

function handleHourClick(dateStr, hour) {
    const date = new Date(dateStr);
    const aptsInHour = getAppointmentsForSlot(date, hour);
    const maxCapacity = MAX_APPOINTMENTS_PER_HOUR * (BUSINESS_HOURS.interval === 30 ? 2 : 1);
    
    // Mostrar citas existentes en este horario
    let existingAppointmentsHtml = '';
    if (aptsInHour.length > 0) {
        existingAppointmentsHtml = `
            <div style="background: #f8f9ff; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h6 style="color: #667eea; margin-bottom: 10px;">📋 Citas en este horario:</h6>
                ${aptsInHour.map(apt => `
                    <div style="background: white; padding: 10px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #007bff;">
                        <div><strong>🕐 ${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</strong></div>
                        <div>👤 ${apt.client}</div>
                        <div>✂️ ${apt.service}</div>
                        <div style="font-size: 0.85rem; color: #666;">📊 Estado: ${apt.status}</div>
                        <button onclick="showAppointmentDetails('${apt.id}')" 
                                class="btn btn-sm btn-primary" 
                                style="margin-top: 8px; font-size: 0.85rem;">
                            Ver Detalles
                        </button>
                    </div>
                `).join('')}
                <hr>
            </div>
        `;
    }
    
    // Verificar disponibilidad
    const isAvailable = aptsInHour.length < maxCapacity;
    const hourStr = `${hour.toString().padStart(2, '0')}:00`;
    const dateFormatted = date.toLocaleDateString('es-ES');
    
    if (!isAvailable) {
        Swal.fire({
            icon: 'warning',
            title: '⚠️ Sin Disponibilidad',
            html: `
                ${existingAppointmentsHtml}
                <p>Este horario está completamente lleno (${aptsInHour.length}/${maxCapacity}).</p>
                <p>Por favor, elige otro horario.</p>
            `,
            confirmButtonText: 'OK',
            width: '600px'
        });
        return;
    }
    
    // Si hay disponibilidad, mostrar opción de agregar cita
    Swal.fire({
        title: `📅 ${dateFormatted} - ${hourStr}`,
        html: `
            ${existingAppointmentsHtml}
            <div style="text-align: center; padding: 15px; background: #d4edda; border-radius: 8px;">
                <p style="margin-bottom: 10px;">
                    ✅ <strong>Disponible</strong> - ${maxCapacity - aptsInHour.length} espacios libres
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
            const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
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
                                <strong style="color: #007bff;">${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</strong>
                                <span style="font-size: 0.8em; color: #666;">⏱️ ${apt.duracion || 60}min</span>
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
    // Convertir dateStr (formato ISO o fecha) al formato correcto
    let fecha = new Date(dateStr);
    if (isNaN(fecha.getTime())) {
        // Si no es una fecha válida, intentar parsear
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
        `<option value="${servicio.id}">${servicio.nombre} - $${servicio.precio} (${servicio.duracion}min)</option>`
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
                    <select id="cliente" class="form-control" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                        <option value="">Seleccionar cliente...</option>
                        ${clientesOptions}
                    </select>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label for="servicio" style="display: block; margin-bottom: 5px; font-weight: bold;">Servicio:</label>
                    <select id="servicio" class="form-control" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                        <option value="">Seleccionar servicio...</option>
                        ${serviciosOptions}
                    </select>
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
                fecha: fechaFormateada, // Usar la fecha formateada correctamente
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
                <p style="margin: 8px 0;"><strong>🕐 Hora:</strong> ${apt.date.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</p>
            </div>
            
            <div style="background: white; padding: 15px; border: 1px solid #e1e5f7; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>👤 Cliente:</strong> ${apt.client}</p>
                <p style="margin: 8px 0;"><strong>📞 Teléfono:</strong> ${apt.telefono}</p>
            </div>
            
            <div style="background: white; padding: 15px; border: 1px solid #e1e5f7; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 8px 0;"><strong>✂️ Servicio:</strong> ${apt.service}</p>
                <p style="margin: 8px 0;"><strong>💅 Manicurista:</strong> ${apt.manicurista}</p>
                <p style="margin: 8px 0;"><strong>⏱️ Duración:</strong> ${apt.duracion || 60} minutos</p>
                ${apt.precio ? `<p style="margin: 8px 0;"><strong>💰 Precio:</strong> $${apt.precio}</p>` : ''}
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
        denyButtonText: '🗑️ Eliminar Cita',
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
            // Confirmar eliminación
            Swal.fire({
                title: '¿Estás seguro?',
                text: "Esta acción no se puede deshacer",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
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

// ============================================
// CORRECCIÓN 5: Función para eliminar cita
// ============================================
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
                title: '🗑️ Cita Cancelada',
                text: 'La cita ha sido cancelada exitosamente',
                timer: 2000,
                showConfirmButton: false
            });
            await loadAppointments();
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('Error eliminando cita:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cancelar la cita: ' + error.message
        });
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