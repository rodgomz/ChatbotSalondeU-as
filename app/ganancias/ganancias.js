async function cargarGanancias() {
    try {
        const res = await fetch('/api/ganancias');
        const data = await res.json();

        document.getElementById('gananciaSemanal').textContent = `$${data.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${data.totalMensual.toFixed(2)}`;

        const tbody = document.getElementById('tablaGanancias');
        tbody.innerHTML = '';

        if (data.citasGanancia.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No hay citas finalizadas.</td></tr>';
            return;
        }

        data.citasGanancia.forEach(cita => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cita.fecha}</td>
                <td>${cita.hora}</td>
                <td>${cita.servicio}</td>
                <td>$${cita.precio.toFixed(2)}</td>
                <td>${cita.manicurista}</td>
                <td>${cita.clienteId}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error al cargar ganancias:', error);
        document.getElementById('tablaGanancias').innerHTML =
            '<tr><td colspan="6">Error al cargar ganancias.</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', cargarGanancias);
