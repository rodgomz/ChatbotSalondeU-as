let chartInstance = null;

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

        // Paneles
        document.getElementById('gananciaSemanal').textContent = `$${dataGanancias.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${dataGanancias.totalMensual.toFixed(2)}`;
        document.getElementById('gananciaAnual').textContent = `$${dataGanancias.totalAnual.toFixed(2)}`;

        // Filtrar por año
        const gastosAnio = dataGastos.filter(g => new Date(g.fecha).getFullYear() === anioFiltro);
        const deudasAnio = dataDeudas.filter(d => new Date(d.fechaCreacion).getFullYear() === anioFiltro);

        const totalGastos = gastosAnio.reduce((acc, g) => acc + parseFloat(g.monto), 0);
        const totalDeudas = deudasAnio.reduce((acc, d) => acc + parseFloat(d.monto), 0);

        document.getElementById('totalGastos').textContent = `$${totalGastos.toFixed(2)}`;
        document.getElementById('totalDeudas').textContent = `$${totalDeudas.toFixed(2)}`;

        const gananciaNeta = dataGanancias.totalAnual - (totalGastos + totalDeudas);
        document.getElementById('gananciaNeta').textContent = `$${gananciaNeta.toFixed(2)}`;

        // Tabla de citas (igual que antes)
        const citasFiltradas = dataGanancias.citasGanancia.filter(c => {
            const [dia, mes, anio] = c.fecha.split('/').map(n => parseInt(n, 10));
            return anio === anioFiltro;
        });

        const tbody = document.getElementById('tablaGanancias');
        tbody.innerHTML = '';
        if (citasFiltradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay citas finalizadas en este año.</td></tr>';
        } else {
            citasFiltradas.forEach(cita => {
                const clienteNombre = dataGanancias.clientes[cita.clienteId]?.nombre || cita.clienteId;
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

        // Calcular Ganancia Neta por mes
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
            deudasMes[fecha.getMonth()] += parseFloat(d.monto);
        });

        for (let i = 0; i < 12; i++) {
            netaMes[i] = gananciasMes[i] - (gastosMes[i] + deudasMes[i]);
        }

        actualizarGraficaNeta(netaMes, anioFiltro);

        document.getElementById('anioGrafica').textContent = anioFiltro;

    } catch (error) {
        console.error('Error al cargar ganancias:', error);
        document.getElementById('tablaGanancias').innerHTML =
            '<tr><td colspan="6" class="no-data">Error al cargar ganancias.</td></tr>';
    }
}

function actualizarGrafica(datos, anio) {
    const ctx = document.getElementById('graficaGananciasMes').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: `Ganancias ${anio}`,
                data: datos,
                backgroundColor: '#667eea',
                borderColor: '#764ba2',
                borderWidth: 2,
                borderRadius: 8,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#333',
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return '$' + value.toFixed(0);
                        },
                        color: '#666'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        color: '#666'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function actualizarGraficaNeta(netaMes, anio) {
    const ctx = document.getElementById('graficaGananciasMes').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
            datasets: [{
                label: `Ganancia Neta ${anio}`,
                data: netaMes,
                backgroundColor: '#28a745',
                borderColor: '#1e7e34',
                borderWidth: 2,
                borderRadius: 8
            }]
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
                    ticks: { callback: value => '$' + value.toFixed(0) }
                }
            }
        }
    });
}
function cargarComboAnio() {
    const select = document.getElementById('selectAnio');
    const actual = new Date().getFullYear();

    // Limpiar opciones previas
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

// Inicializar cuando carga el DOM
document.addEventListener('DOMContentLoaded', () => {
    cargarComboAnio();
    cargarGanancias();
});