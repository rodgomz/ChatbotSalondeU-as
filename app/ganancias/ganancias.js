  let chartInstance = null;

        async function cargarGanancias(anioFiltro = new Date().getFullYear()) {
            try {
                const res = await fetch('/api/ganancias');
                const data = await res.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                // Actualizar paneles
                document.getElementById('gananciaSemanal').textContent = `$${data.totalSemanal.toFixed(2)}`;
                document.getElementById('gananciaMensual').textContent = `$${data.totalMensual.toFixed(2)}`;
                document.getElementById('gananciaAnual').textContent = `$${data.totalAnual.toFixed(2)}`;

                // Filtrar citas por año
                const citasFiltradas = data.citasGanancia.filter(c => {
                    const [dia, mes, anio] = c.fecha.split('/').map(n => parseInt(n, 10));
                    return anio === anioFiltro;
                });

                // Llenar tabla
                const tbody = document.getElementById('tablaGanancias');
                tbody.innerHTML = '';

                if (citasFiltradas.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay citas finalizadas en este año.</td></tr>';
                } else {
                    citasFiltradas.forEach(cita => {
                        const clienteNombre = data.clientes[cita.clienteId]?.nombre || cita.clienteId;
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

                // Calcular ganancias por mes
                const gananciasMes = new Array(12).fill(0);
                citasFiltradas.forEach(cita => {
                    const [dia, mes] = cita.fecha.split('/').map(n => parseInt(n, 10));
                    gananciasMes[mes - 1] += cita.precio;
                });

                // Actualizar gráfica
                actualizarGrafica(gananciasMes, anioFiltro);
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
                                callback: function(value) {
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