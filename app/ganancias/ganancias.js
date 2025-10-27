let chartInstance = null;
let chartSemanalInstance = null;
let todasLasCitas = [];
let todosLosGastos = [];
let todasLasDeudas = [];
let clientesGlobal = {};
let anioActual = new Date().getFullYear();

async function cargarGanancias(anioFiltro = new Date().getFullYear()) {
    try {
        anioActual = anioFiltro;
        
        const [resGanancias, resGastos, resDeudas] = await Promise.all([
            fetch('/api/ganancias'),
            fetch('/api/gastos'),
            fetch('/api/deudas')
        ]);

        const dataGanancias = await resGanancias.json();
        const responseGastos = await resGastos.json();
        const responseDeudas = await resDeudas.json();

        // Extraer datos según la estructura de respuesta
        const gastosArray = responseGastos.gastos || [];
        const deudasArray = responseDeudas.deudas || [];
        const citasArray = Object.values(dataGanancias.citasGanancia || {});
        clientesGlobal = dataGanancias.clientes || {};

        // Guardar datos globalmente
        todasLasCitas = citasArray;
        todosLosGastos = gastosArray;
        todasLasDeudas = deudasArray;

        // --- Paneles ---
        document.getElementById('gananciaSemanal').textContent = `$${dataGanancias.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${dataGanancias.totalMensual.toFixed(2)}`;
        document.getElementById('gananciaAnual').textContent = `$${dataGanancias.totalAnual.toFixed(2)}`;

        const gastosAnio = gastosArray.filter(g => new Date(g.fecha).getFullYear() === anioFiltro);
        const deudasAnio = deudasArray.filter(d => new Date(d.fechaCreacion).getFullYear() === anioFiltro);

        const totalGastos = gastosAnio.reduce((acc, g) => acc + parseFloat(g.monto), 0);
        const totalDeudas = deudasAnio.reduce((acc, d) => acc + parseFloat(d.monto || 0), 0);

        document.getElementById('totalGastos').textContent = `$${totalGastos.toFixed(2)}`;
        document.getElementById('totalDeudas').textContent = `$${totalDeudas.toFixed(2)}`;

        const gananciaNeta = dataGanancias.totalAnual - (totalGastos + totalDeudas);
        document.getElementById('gananciaNeta').textContent = `$${gananciaNeta.toFixed(2)}`;

        // --- Tabla de Citas Mensuales ---
        const citasFiltradas = citasArray.filter(c => {
            const [dia, mes, anio] = c.fecha.split('/').map(n => parseInt(n, 10));
            return anio === anioFiltro;
        });

        const tbody = document.getElementById('tablaGanancias');
        tbody.innerHTML = '';
        if (citasFiltradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay citas finalizadas en este año.</td></tr>';
        } else {
            citasFiltradas.forEach(cita => {
                const clienteNombre = clientesGlobal[cita.clienteId]?.nombre || cita.clienteId;
                const manicuristaNombre = cita.manicurista || 'Sin asignar';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${cita.fecha}</td>
                    <td>${cita.hora}</td>
                    <td>${cita.servicio}</td>
                    <td>$${cita.precio.toFixed(2)}</td>
                    <td>${manicuristaNombre}</td>
                    <td>${clienteNombre}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // --- Ganancia Neta por Mes ---
        const gananciasMes = new Array(12).fill(0);
        const gastosMes = new Array(12).fill(0);
        const deudasMes = new Array(12).fill(0);
        const netaMes = new Array(12).fill(0);

        citasFiltradas.forEach(cita => {
            const [dia, mes] = cita.fecha.split('/').map(n => parseInt(n, 10));
            gananciasMes[mes - 1] += cita.precio;
        });

        gastosAnio.forEach(g => {
            const fecha = new Date(g.fecha);
            gastosMes[fecha.getMonth()] += parseFloat(g.monto);
        });

        deudasAnio.forEach(d => {
            const fecha = new Date(d.fechaCreacion);
            deudasMes[fecha.getMonth()] += parseFloat(d.monto || 0);
        });

        for (let i = 0; i < 12; i++) {
            netaMes[i] = gananciasMes[i] - (gastosMes[i] + deudasMes[i]);
        }

        actualizarGraficaNeta(netaMes, anioFiltro);
        document.getElementById('anioGrafica').textContent = anioFiltro;

        // --- Ganancia, Gastos y Deudas Semanal ---
        const semanasMap = {}; // { semana: {ganancia, gasto, deuda, citas: [], fechaInicio, fechaFin} }

        citasFiltradas.forEach(cita => {
            const [dia, mes, anio] = cita.fecha.split('/').map(n => parseInt(n, 10));
            const fecha = new Date(anio, mes - 1, dia);
            const semana = getWeekNumber(fecha);
            
            if (!semanasMap[semana]) {
                const rangoSemana = obtenerRangoSemana(fecha);
                semanasMap[semana] = { 
                    ganancia: 0, 
                    gasto: 0, 
                    deuda: 0, 
                    citas: [],
                    fechaInicio: rangoSemana.inicio,
                    fechaFin: rangoSemana.fin
                };
            }
            semanasMap[semana].ganancia += cita.precio;
            semanasMap[semana].citas.push(cita);
        });

        gastosAnio.forEach(g => {
            const fecha = new Date(g.fecha);
            const semana = getWeekNumber(fecha);
            if (!semanasMap[semana]) {
                const rangoSemana = obtenerRangoSemana(fecha);
                semanasMap[semana] = { 
                    ganancia: 0, 
                    gasto: 0, 
                    deuda: 0, 
                    citas: [],
                    fechaInicio: rangoSemana.inicio,
                    fechaFin: rangoSemana.fin
                };
            }
            semanasMap[semana].gasto += parseFloat(g.monto);
        });

        deudasAnio.forEach(d => {
            const fecha = new Date(d.fechaCreacion);
            const semana = getWeekNumber(fecha);
            if (!semanasMap[semana]) {
                const rangoSemana = obtenerRangoSemana(fecha);
                semanasMap[semana] = { 
                    ganancia: 0, 
                    gasto: 0, 
                    deuda: 0, 
                    citas: [],
                    fechaInicio: rangoSemana.inicio,
                    fechaFin: rangoSemana.fin
                };
            }
            semanasMap[semana].deuda += parseFloat(d.monto || 0);
        });

        const semanaLabels = Object.keys(semanasMap).sort((a,b)=> a-b);
        const gananciaSemanal = semanaLabels.map(s => semanasMap[s].ganancia);
        const gastoSemanal = semanaLabels.map(s => semanasMap[s].gasto);
        const deudaSemanal = semanaLabels.map(s => semanasMap[s].deuda);

        actualizarGraficaSemanal(semanaLabels, gananciaSemanal, gastoSemanal, deudaSemanal);
        document.getElementById('anioGraficaSem').textContent = anioFiltro;

        // Cargar selector de semanas
        cargarSelectorSemanas(semanasMap, semanaLabels);

        // Mostrar primera semana por defecto
        if (semanaLabels.length > 0) {
            mostrarCitasSemana(semanaLabels[0], semanasMap);
        }

    } catch (error) {
        console.error('Error al cargar ganancias:', error);
        document.getElementById('tablaGanancias').innerHTML =
            '<tr><td colspan="6" class="no-data">Error al cargar ganancias.</td></tr>';
        document.getElementById('tablaGananciasSemanal').innerHTML =
            '<tr><td colspan="7" class="no-data">Error al cargar ganancias.</td></tr>';
    }
}

// Función para obtener el rango de fechas de una semana
function obtenerRangoSemana(fecha) {
    const date = new Date(fecha);
    const day = date.getDay();
    const diff = date.getDate() - day; // Domingo como inicio
    
    const inicio = new Date(date.setDate(diff));
    const fin = new Date(date.setDate(diff + 6));
    
    return {
        inicio: formatearFecha(inicio),
        fin: formatearFecha(fin)
    };
}

// Función para formatear fecha como DD/MM/YYYY
function formatearFecha(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

// Cargar selector de semanas
function cargarSelectorSemanas(semanasMap, semanaLabels) {
    const select = document.getElementById('selectSemana');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Todas las semanas --</option>';
    
    semanaLabels.forEach(semana => {
        const datos = semanasMap[semana];
        const option = document.createElement('option');
        option.value = semana;
        option.textContent = `Semana ${semana} (${datos.fechaInicio} - ${datos.fechaFin})`;
        select.appendChild(option);
    });
    
    // Event listener
    select.removeEventListener('change', handleSemanaChange);
    select.addEventListener('change', (e) => {
        if (e.target.value === '') {
            mostrarTodasLasSemanas(semanasMap, semanaLabels);
        } else {
            mostrarCitasSemana(e.target.value, semanasMap);
        }
    });
}

// Mostrar citas de una semana específica
function mostrarCitasSemana(semana, semanasMap) {
    const datos = semanasMap[semana];
    const tbodySemanal = document.getElementById('tablaGananciasSemanal');
    tbodySemanal.innerHTML = '';
    
    if (!datos || datos.citas.length === 0) {
        tbodySemanal.innerHTML = '<tr><td colspan="7" class="no-data">No hay citas en esta semana.</td></tr>';
        return;
    }
    
    datos.citas.forEach((cita, index) => {
        const clienteNombre = clientesGlobal[cita.clienteId]?.nombre || cita.clienteId;
        const manicuristaNombre = cita.manicurista || 'Sin asignar';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index === 0 ? `Semana ${semana}<br><small>(${datos.fechaInicio} - ${datos.fechaFin})</small>` : ''}</td>
            <td>${cita.fecha}</td>
            <td>${cita.hora}</td>
            <td>${cita.servicio}</td>
            <td>$${cita.precio.toFixed(2)}</td>
            <td>${manicuristaNombre}</td>
            <td>${clienteNombre}</td>
        `;
        tbodySemanal.appendChild(tr);
    });
}

// Mostrar todas las semanas
function mostrarTodasLasSemanas(semanasMap, semanaLabels) {
    const tbodySemanal = document.getElementById('tablaGananciasSemanal');
    tbodySemanal.innerHTML = '';
    
    if (semanaLabels.length === 0) {
        tbodySemanal.innerHTML = '<tr><td colspan="7" class="no-data">No hay citas finalizadas en este año.</td></tr>';
        return;
    }
    
    semanaLabels.forEach(semana => {
        const citasSemana = semanasMap[semana].citas;
        citasSemana.forEach((cita, index) => {
            const clienteNombre = clientesGlobal[cita.clienteId]?.nombre || cita.clienteId;
            const manicuristaNombre = cita.manicurista || 'Sin asignar';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index === 0 ? `Semana ${semana}<br><small>(${semanasMap[semana].fechaInicio} - ${semanasMap[semana].fechaFin})</small>` : ''}</td>
                <td>${cita.fecha}</td>
                <td>${cita.hora}</td>
                <td>${cita.servicio}</td>
                <td>$${cita.precio.toFixed(2)}</td>
                <td>${manicuristaNombre}</td>
                <td>${clienteNombre}</td>
            `;
            tbodySemanal.appendChild(tr);
        });
    });
}

// --- Función para obtener número de semana ---
function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}

// --- Gráficas ---
function actualizarGraficaNeta(netaMes, anio) {
    const ctx = document.getElementById('graficaGananciasMes').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
            datasets: [{ label: `Ganancia Neta ${anio}`, data: netaMes, backgroundColor:'#28a745' }]
        },
        options: { responsive:true, maintainAspectRatio:false }
    });
}

function actualizarGraficaSemanal(labels, ganancia, gasto, deuda) {
    const ctx = document.getElementById('graficaGananciasSemanal').getContext('2d');
    if (chartSemanalInstance) chartSemanalInstance.destroy();

    chartSemanalInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(s => `Semana ${s}`),
            datasets: [
                { label: 'Ganancia', data: ganancia, backgroundColor:'#28a745' },
                { label: 'Gastos', data: gasto, backgroundColor:'#ffc107' },
                { label: 'Deudas', data: deuda, backgroundColor:'#dc3545' }
            ]
        },
        options: { responsive:true, maintainAspectRatio:false }
    });
}

function cargarComboAnio() {
    const select = document.getElementById('selectAnio');
    const actual = new Date().getFullYear();
    select.innerHTML = '';
    for(let i=actual; i>=actual-5; i--){
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        select.appendChild(option);
    }
    select.value = actual;
    select.addEventListener('change', e => cargarGanancias(parseInt(e.target.value)));
}

// Handler para evitar duplicación de eventos
function handleSemanaChange(e) {
    // Implementado en cargarSelectorSemanas
}

document.addEventListener('DOMContentLoaded', () => {
    cargarComboAnio();
    cargarGanancias();
});