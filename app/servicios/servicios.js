// Usar la configuración de firebase.js
const database = firebase.database();
const serviciosRef = database.ref('servicios');

// Variables globales
let editingServiceId = null;
let services = {};

// Elementos DOM
const form = document.getElementById('service-form');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const servicesContainer = document.getElementById('services-container');
const loadingDiv = document.getElementById('loading');
const alertContainer = document.getElementById('alert-container');

// Mostrar alertas
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Limpiar formulario
function clearForm() {
    form.reset();
    document.getElementById('service-id').value = '';
    editingServiceId = null;
    formTitle.textContent = '➕ Agregar Nuevo Servicio';
    submitBtn.textContent = 'Agregar Servicio';
    cancelBtn.style.display = 'none';
}

// Cargar servicios desde Firebase
function loadServices() {
    loadingDiv.style.display = 'block';
    servicesContainer.style.display = 'none';
    
    serviciosRef.on('value', (snapshot) => {
        services = snapshot.val() || {};
        displayServices();
        loadingDiv.style.display = 'none';
        servicesContainer.style.display = 'grid';
    }, (error) => {
        console.error('Error al cargar servicios:', error);
        showAlert('Error al cargar los servicios', 'error');
        loadingDiv.style.display = 'none';
    });
}

// Mostrar servicios en el DOM
function displayServices() {
    servicesContainer.innerHTML = '';
    
    if (Object.keys(services).length === 0) {
        servicesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No hay servicios registrados</p>';
        return;
    }

    Object.entries(services).forEach(([id, servicio]) => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        
        serviceCard.innerHTML = `
            <div class="service-title">${servicio.nombre || 'Sin nombre'}</div>
            <div class="service-description">${servicio.descripcion || 'Sin descripción'}</div>
            <div class="service-price">$${(servicio.precio || 0).toFixed(2)}</div>
            ${servicio.duracion ? `<p><strong>Duración:</strong> ${servicio.duracion} min</p>` : ''}
            ${servicio.categoria ? `<p><strong>Categoría:</strong> ${servicio.categoria}</p>` : ''}
            <div class="service-actions">
                <button class="btn btn-warning" onclick="editService('${id}')">Editar</button>
                <button class="btn btn-danger" onclick="deleteService('${id}')">Eliminar</button>
            </div>
        `;
        
        servicesContainer.appendChild(serviceCard);
    });
}

// Agregar o actualizar servicio
async function saveService(serviceData) {
    try {
        if (editingServiceId) {
            // Actualizar servicio existente
            serviceData.id = editingServiceId; // Asegurar que el ID esté incluido
            await serviciosRef.child(editingServiceId).update(serviceData);
            showAlert('Servicio actualizado correctamente');
        } else {
            // Crear nuevo servicio
            const newServiceRef = await serviciosRef.push();
            const newServiceId = newServiceRef.key;
            serviceData.id = newServiceId; // Agregar el ID al objeto
            await newServiceRef.set(serviceData);
            showAlert('Servicio agregado correctamente');
        }
        clearForm();
    } catch (error) {
        console.error('Error al guardar servicio:', error);
        showAlert('Error al guardar el servicio', 'error');
    }
}

// Editar servicio
function editService(serviceId) {
    const servicio = services[serviceId];
    if (!servicio) return;

    editingServiceId = serviceId;
    document.getElementById('service-id').value = serviceId;
    document.getElementById('nombre').value = servicio.nombre || '';
    document.getElementById('precio').value = servicio.precio || '';
    document.getElementById('descripcion').value = servicio.descripcion || '';
    document.getElementById('duracion').value = servicio.duracion || '';
    document.getElementById('categoria').value = servicio.categoria || '';

    formTitle.textContent = '✏️ Editar Servicio';
    submitBtn.textContent = 'Actualizar Servicio';
    cancelBtn.style.display = 'inline-block';

    // Scroll al formulario
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
}

// Eliminar servicio
async function deleteService(serviceId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este servicio?')) {
        return;
    }

    try {
        await serviciosRef.child(serviceId).remove();
        showAlert('Servicio eliminado correctamente');
    } catch (error) {
        console.error('Error al eliminar servicio:', error);
        showAlert('Error al eliminar el servicio', 'error');
    }
}

// Event Listeners
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const serviceData = {
        nombre: formData.get('nombre').trim(),
        precio: parseFloat(formData.get('precio')) || 0,
        descripcion: formData.get('descripcion').trim(),
        duracion: parseInt(formData.get('duracion')) || null,
        categoria: formData.get('categoria') || null,
        fechaCreacion: editingServiceId ? services[editingServiceId].fechaCreacion : new Date().toISOString(),
        fechaActualizacion: new Date().toISOString()
    };

    // Validación básica
    if (!serviceData.nombre) {
        showAlert('El nombre del servicio es requerido', 'error');
        return;
    }

    saveService(serviceData);
});

cancelBtn.addEventListener('click', () => {
    clearForm();
});

// Inicializar la aplicación
loadServices();