async function cargarGanancias(anioSeleccionado = new Date().getFullYear()) {
    try {
        const res = await fetch(`/api/ganancias?anio=${anioSeleccionado}`);
        const data = await res.json();

        document.getElementById('gananciaSemanal').textContent = `$${data.totalSemanal.toFixed(2)}`;
        document.getElementById('gananciaMensual').textContent = `$${data.totalMensual.toFixed(2)}`;
        document.getElementById('gananciaAnual').textContent = `$${data.totalAnual.toFixed(2)}`;

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

function inicializarSelectorAnio() {
    const select = document.getElementById('selectAnio');
    const anioActual = new Date().getFullYear();

    for (let anio = anioActual; anio >= anioActual - 5; anio--) {
        const option = document.createElement('option');
        option.value = anio;
        option.textContent = anio;
        select.appendChild(option);
    }

    select.value = anioActual;
    select.addEventListener('change', () => {
        cargarGanancias(select.value);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarSelectorAnio();
    cargarGanancias();
});


document.addEventListener('DOMContentLoaded', cargarGanancias);
