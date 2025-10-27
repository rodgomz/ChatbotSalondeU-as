let chartInstanceMes = null;
let chartInstanceSemana = null;

// Función principal para cargar ganancias
async function cargarGanancias(anioFiltro = new Date().getFullYear()) {
    try {
        const [resGanancias, resGastos, resDeudas] = await Promise.all([
            fetch('/api/ganancias'),
            fetch('/api/gastos'),
            fetch('/api/deudas')
        ]);

        const dataGanancias = await resGanancias.json();
        const dataGastos = await resGastos.json();
        const dataDeudas = await resDeudas.json();

        // --- Cards generales ---
        document.getElementById('gananciaSemanal').textContent = `$${dataGanancias.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${dataGanancias.totalMensual.toFixed(2)}`;
        document.getElementById('gananciaAnual').textContent = `$${dataGanancias.totalAnual.toFixed(2)}`;

        // Filtrar por año
        const gastosAnio = dataGastos.filter(g => new Date(g.fecha).getFullYear() === anioFiltro);
        const deudasAnio = dataDeudas.filter(d => new Date(d.fechaCreacion).getFullYear() === anioFiltro);

        const totalGastos = gastosAnio.reduce((acc, g) => acc + parseFloat(g.monto), 0);
        const totalDeudas = deudasAnio.reduce((acc, d) => acc + parseFloat(d.monto), 0);
        const gananciaNeta = dataGanancias.totalAnual - (totalGastos + totalDeudas);

        document.getElementById('totalGastos').textContent = `$${totalGastos.toFixed(2)}`;
        document.getElementById('totalDeudas').textContent = `$${totalDeudas.toFixed(2)}`;
        document.getElementById('gananciaNeta').textContent = `$${gananciaNeta.toFixed(2)}`;

        // --- Tabla y gráfica mensual ---
        const citasFiltradas = dataGanancias.citasGanancia.filter(c => {
            const [dia, mes, anio] = c.fecha.split('/').map(n => parseInt(n, 10));
            return anio === anioFiltro;
        });

        llenarTabla(citasFiltradas, 'tablaGanancias', dataGanancias.clientes);
        const { netaMes } = calcularGananciaPorMes(citasFiltradas, gastosAnio, deudasAnio);
        actualizarGraficaMes(netaMes, anioFiltro);
        document.getElementById('anioGrafica').textContent = anioFiltro;

        // --- Cálculo semanal ---
        const { semanasOrdenadas, ganancias, gastosArr, deudasArr, citasSemana } = calcularGananciaPorSemana(citasFiltradas, gastosAnio, deudasAnio);
        actualizarGraficaSemana(ganancias, gastosArr, deudasArr, semanasOrdenadas, anioFiltro);
        llenarTabla(citasSemana, 'tablaGananciasSemanal', dataGanancias.clientes, true);
        document.getElementById('anioGraficaSem').textContent = anioFiltro;

    } catch (error) {
        console.error('Error al cargar ganancias:', error);
        document.getElementById('tablaGanancias').innerHTML =
            '<tr><td colspan="6" class="no-data">Error al cargar ganancias.</td></tr>';
        document.getElementById('tablaGananciasSemanal').innerHTML =
            '<tr><td colspan="7" class="no-data">Error al cargar ganancias semanales.</td></tr>';
    }
}

// --- Funciones auxiliares ---

function llenarTabla(citas, tbodyId, clientes, mostrarSemana = false) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';

    if (citas.length === 0) {
        const colspan = mostrarSemana ? 7 : 6;
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="no-data">No hay citas finalizadas.</td></tr>`;
        return;
    }

    citas.forEach(cita => {
        const clienteNombre = clientes[cita.clienteId]?.nombre || cita.clienteId;
        const manicuristaNombre = cita.manicurista || 'Sin asignar';
        const tr = document.createElement('tr');
        if (mostrarSemana) {
            const semana = cita.semana || '-';
            tr.innerHTML = `
                <td>${semana}</td>
                <td>${cita.fecha}</td>
                <td>${cita.hora}</td>
                <td>${cita.servicio}</td>
                <td>$${cita.precio.toFixed(2)}</td>
                <td>${manicuristaNombre}</td>
                <td>${clienteNombre}</td>
            `;
        } else {
            tr.innerHTML = `
                <td>${cita.fecha}</td>
                <td>${cita.hora}</td>
                <td>${cita.servicio}</td>
                <td>$${cita.precio.toFixed(2)}</td>
                <td>${manicuristaNombre}</td>
                <td>${clienteNombre}</td>
            `;
        }
        tbody.appendChild(tr);
    });
}

// --- Ganancia mensual ---
function calcularGananciaPorMes(citas, gastos, deudas) {
    const gananciasMes = new Array(12).fill(0);
    const gastosMes = new Array(12).fill(0);
    const deudasMes = new Array(12).fill(0);
    const netaMes = new Array(12).fill(0);

    citas.forEach(cita => {
        const [dia, mes] = cita.fecha.split('/').map(n => parseInt(n, 10));
        gananciasMes[mes - 1] += cita.precio;
    });

    gastos.forEach(g => {
        const fecha = new Date(g.fecha);
        gastosMes[fecha.getMonth()] += parseFloat(g.monto);
    });

    deudas.forEach(d => {
        const fecha = new Date(d.fechaCreacion);
        deudasMes[fecha.getMonth()] += parseFloat(d.monto);
    });

    for (let i = 0; i < 12; i++) {
        netaMes[i] = gananciasMes[i] - (gastosMes[i] + deudasMes[i]);
    }

    return { netaMes };
}

// --- Ganancia semanal con Ganancia, Gasto y Deuda ---
function calcularGananciaPorSemana(citas, gastos, deudas) {
    const semanaData = {}; // { semana: { ganancia, gasto, deuda } }
    const citasSemana = [];

    // Citas
    citas.forEach(cita => {
        const [dia, mes, anio] = cita.fecha.split('/').map(n => parseInt(n, 10));
        const fecha = new Date(anio, mes - 1, dia);
        const semana = getWeekNumber(fecha);
        cita.semana = semana;

        if (!semanaData[semana]) semanaData[semana] = { ganancia: 0, gasto: 0, deuda: 0 };
        semanaData[semana].ganancia += cita.precio;
        citasSemana.push(cita);
    });

    // Gastos
    gastos.forEach(g => {
        const fecha = new Date(g.fecha);
        const semana = getWeekNumber(fecha);
        if (!semanaData[semana]) semanaData[semana] = { ganancia: 0, gasto: 0, deuda: 0 };
        semanaData[semana].gasto += parseFloat(g.monto);
    });

    // Deudas
    deudas.forEach(d => {
        const fecha = new Date(d.fechaCreacion);
        const semana = getWeekNumber(fecha);
        if (!semanaData[semana]) semanaData[semana] = { ganancia: 0, gasto: 0, deuda: 0 };
        semanaData[semana].deuda += parseFloat(d.monto);
    });

    // Convertir a arrays ordenados por semana
    const semanasOrdenadas = Object.keys(semanaData).map(Number).sort((a, b) => a - b);
    const ganancias = semanasOrdenadas.map(s => semanaData[s].ganancia);
    const gastosArr = semanasOrdenadas.map(s => semanaData[s].gasto);
    const deudasArr = semanasOrdenadas.map(s => semanaData[s].deuda);

    return { semanasOrdenadas, ganancias, gastosArr, deudasArr, citasSemana };
}

// --- Gráfica semanal actualizada con tres barras ---
function actualizarGraficaSemana(datosGan, datosGastos, datosDeudas, semanas, anio) {
    const ctx = document.getElementById('graficaGananciasSemanal').getContext('2d');
    if (chartInstanceSemana) chartInstanceSemana.destroy();

    const labels = semanas.map(s => 'Semana ' + s);

    chartInstanceSemana = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ganancia',
                    data: datosGan,
                    backgroundColor: '#28a745',
                    borderColor: '#1e7e34',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Gasto',
                    data: datosGastos,
                    backgroundColor: '#dc3545',
                    borderColor: '#a71d2a',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Deuda',
                    data: datosDeudas,
                    backgroundColor: '#ffc107',
                    borderColor: '#cc9a06',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `$${context.raw.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '$' + v.toFixed(0) }
                }
            }
        }
    });
}


// --- Función para obtener número de semana ISO ---
function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// --- Gráficas ---
function actualizarGraficaMes(datos, anio) {
    const ctx = document.getElementById('graficaGananciasMes').getContext('2d');
    if (chartInstanceMes) chartInstanceMes.destroy();

    chartInstanceMes = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: `Ganancia Neta ${anio}`,
                data: datos,
                backgroundColor: '#28a745',
                borderColor: '#1e7e34',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(0) } }
            }
        }
    });
}


// --- Selector de año ---
function cargarComboAnio() {
    const select = document.getElementById('selectAnio');
    const actual = new Date().getFullYear();
    select.innerHTML = '';
    for (let i = actual; i >= actual - 5; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        select.appendChild(option);
    }
    select.value = actual;
    select.addEventListener('change', (e) => {
        cargarGanancias(parseInt(e.target.value));
    });
}

// --- Inicializar ---
document.addEventListener('DOMContentLoaded', () => {
    cargarComboAnio();
    cargarGanancias();
});
