async function cargarGanancias(anioFiltro = new Date().getFullYear()) {
    try {
        const res = await fetch('/api/ganancias');
        const data = await res.json();

        // Paneles
        document.getElementById('gananciaSemanal').textContent = `$${data.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${data.totalMensual.toFixed(2)}`;
        document.getElementById('gananciaAnual').textContent = `$${data.totalAnual.toFixed(2)}`;

        // Tabla de citas
        const tbody = document.getElementById('tablaGanancias');
        tbody.innerHTML = '';

        // Filtrar por año
        const citasFiltradas = data.citasGanancia.filter(c => {
            const [dia, mes, anio] = c.fecha.split('/').map(n => parseInt(n, 10));
            return anio === anioFiltro;
        });

        if (citasFiltradas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay citas finalizadas.</td></tr>';
        } else {
            citasFiltradas.forEach(cita => {
                const clienteNombre = data.clientes[cita.clienteId]?.nombre || cita.clienteId;
                const manicuristaNombre = data.manicuristas[cita.manicuristaId]?.nombre || cita.manicuristaId || 'Sin asignar';
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

        // Gráfica mes a mes
        const gananciasMes = new Array(12).fill(0);
        citasFiltradas.forEach(cita => {
            const [dia, mes] = cita.fecha.split('/').map(n => parseInt(n, 10));
            gananciasMes[mes - 1] += cita.precio;
        });

        const ctx = document.getElementById('graficaGananciasMes').getContext('2d');
        if (window.graficaMes) window.graficaMes.destroy();
        window.graficaMes = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
                datasets: [{
                    label: `Ganancias ${anioFiltro}`,
                    data: gananciasMes,
                    backgroundColor: '#f1c40f'
                }]
            },
            options: { scales: { y: { beginAtZero: true } } }
        });

        document.getElementById('anioGrafica').textContent = anioFiltro;

    } catch (error) {
        console.error('Error al cargar ganancias:', error);
        document.getElementById('tablaGanancias').innerHTML =
            '<tr><td colspan="6">Error al cargar ganancias.</td></tr>';
    }
}

// llenar combo de años
function cargarComboAnio() {
    const select = document.getElementById('selectAnio');
    const actual = new Date().getFullYear();
    for (let i = actual; i >= actual - 5; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        select.appendChild(option);
    }
    select.value = actual;
    select.addEventListener('change', () => cargarGanancias(parseInt(select.value)));
}

// DOMContentLoaded único
document.addEventListener('DOMContentLoaded', () => {
    cargarComboAnio();
    cargarGanancias();
});
