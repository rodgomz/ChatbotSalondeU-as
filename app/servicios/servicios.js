// Inicializar Firebase (asume que firebase ya está cargado desde el HTML)
const database = firebase.database();
const storage = firebase.storage();
const serviciosRef = database.ref('servicios');

// Variables globales
let editingServiceId = null;
let services = {};
let currentImageFile = null;

// Elementos DOM
const form = document.getElementById('service-form');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const servicesContainer = document.getElementById('services-container');
const loadingDiv = document.getElementById('loading');
const alertContainer = document.getElementById('alert-container');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const imageUploadArea = document.getElementById('image-upload-area');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');

// ==========================
// Manejo de carga de imágenes
// ==========================
function initImageHandlers() {
    imageUploadArea.addEventListener('click', () => imageInput.click());
    
    imageInput.addEventListener('change', (e) => {
        handleImageSelection(e.target.files[0]);
    });

    // Drag and drop
    imageUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageUploadArea.classList.add('dragover');
    });

    imageUploadArea.addEventListener('dragleave', () => {
        imageUploadArea.classList.remove('dragover');
    });

    imageUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        imageUploadArea.classList.remove('dragover');
        handleImageSelection(e.dataTransfer.files[0]);
    });
}

function handleImageSelection(file) {
    if (!file || !file.type.startsWith('image/')) {
        showAlert('Por favor selecciona una imagen válida', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showAlert('La imagen no debe superar los 5MB', 'error');
        return;
    }

    currentImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// ==========================
// Subir imagen a Firebase Storage
// ==========================
async function uploadImage(file, serviceId) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const extension = file.name.split('.').pop();
        const fileName = `servicios/${serviceId}_${timestamp}.${extension}`;
        const storageRef = storage.ref(fileName);
        const uploadTask = storageRef.put(file);

        uploadProgress.style.display = 'block';

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressFill.style.width = progress + '%';
                progressFill.textContent = Math.round(progress) + '%';
            },
            (error) => {
                console.error('Error subiendo imagen:', error);
                uploadProgress.style.display = 'none';
                reject(error);
            },
            async () => {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                uploadProgress.style.display = 'none';
                resolve(downloadURL);
            }
        );
    });
}

// ==========================
// Eliminar imagen de Firebase Storage
// ==========================
async function deleteImage(imageUrl) {
    if (!imageUrl) return;
    try {
        const imageRef = storage.refFromURL(imageUrl);
        await imageRef.delete();
        console.log('Imagen anterior eliminada');
    } catch (error) {
        console.error('Error eliminando imagen anterior:', error);
    }
}

// ==========================
// Mostrar alertas
// ==========================
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

// ==========================
// Limpiar formulario
// ==========================
function clearForm() {
    form.reset();
    document.getElementById('service-id').value = '';
    document.getElementById('current-image-url').value = '';
    imagePreview.style.display = 'none';
    imagePreview.src = '';
    currentImageFile = null;
    editingServiceId = null;
    formTitle.textContent = '➕ Agregar Nuevo Servicio';
    submitBtn.textContent = 'Agregar Servicio';
    cancelBtn.style.display = 'none';
}

// ==========================
// Cargar servicios desde Firebase
// ==========================
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

// ==========================
// Mostrar servicios en el DOM
// ==========================
function displayServices() {
    servicesContainer.innerHTML = '';
    
    if (Object.keys(services).length === 0) {
        servicesContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No hay servicios registrados</p>';
        return;
    }

    Object.entries(services).forEach(([id, servicio]) => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        
        const imageHTML = servicio.imagenUrl 
            ? `<img src="${servicio.imagenUrl}" alt="${servicio.nombre}" class="service-image">`
            : `<div class="no-image-placeholder">📷</div>`;
        
        serviceCard.innerHTML = `
            ${imageHTML}
            <div class="service-content">
                <div class="service-title">${servicio.nombre || 'Sin nombre'}</div>
                <div class="service-description">${servicio.descripcion || 'Sin descripción'}</div>
                <div class="service-price">$${(servicio.precio || 0).toFixed(2)}</div>
                <div class="service-meta">
                    ${servicio.duracion ? `<span>⏱️ ${servicio.duracion} min</span>` : ''}
                    ${servicio.categoria ? `<span>📁 ${servicio.categoria}</span>` : ''}
                </div>
                <div class="service-actions">
                    <button class="btn btn-warning" onclick="editService('${id}')">Editar</button>
                    <button class="btn btn-danger" onclick="deleteService('${id}')">Eliminar</button>
                </div>
            </div>
        `;
        
        servicesContainer.appendChild(serviceCard);
    });
}

// ==========================
// Guardar servicio (agregar o actualizar)
// ==========================
async function saveService(serviceData) {
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        let imageUrl = document.getElementById('current-image-url').value;

        // Si hay una nueva imagen, subirla
        if (currentImageFile) {
            const serviceId = editingServiceId || database.ref().child('servicios').push().key;
            
            // Si estamos editando y había una imagen anterior, eliminarla
            if (editingServiceId && imageUrl) {
                await deleteImage(imageUrl);
            }
            
            imageUrl = await uploadImage(currentImageFile, serviceId);
            serviceData.imagenUrl = imageUrl;
        }

        if (editingServiceId) {
            // Actualizar servicio existente
            serviceData.id = editingServiceId;
            if (!currentImageFile && imageUrl) {
                serviceData.imagenUrl = imageUrl;
            }
            await serviciosRef.child(editingServiceId).update(serviceData);
            showAlert('Servicio actualizado correctamente');
        } else {
            // Crear nuevo servicio
            const newServiceRef = await serviciosRef.push();
            const newServiceId = newServiceRef.key;
            serviceData.id = newServiceId;
            await newServiceRef.set(serviceData);
            showAlert('Servicio agregado correctamente');
        }
        
        clearForm();
    } catch (error) {
        console.error('Error al guardar servicio:', error);
        showAlert('Error al guardar el servicio: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editingServiceId ? 'Actualizar Servicio' : 'Agregar Servicio';
    }
}

// ==========================
// Editar servicio
// ==========================
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

    if (servicio.imagenUrl) {
        document.getElementById('current-image-url').value = servicio.imagenUrl;
        imagePreview.src = servicio.imagenUrl;
        imagePreview.style.display = 'block';
    }

    formTitle.textContent = '✏️ Editar Servicio';
    submitBtn.textContent = 'Actualizar Servicio';
    cancelBtn.style.display = 'inline-block';

    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
}

// ==========================
// Eliminar servicio
// ==========================
async function deleteService(serviceId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este servicio y su imagen?')) {
        return;
    }

    try {
        const servicio = services[serviceId];
        
        // Eliminar imagen si existe
        if (servicio.imagenUrl) {
            await deleteImage(servicio.imagenUrl);
        }
        
        // Eliminar servicio de la base de datos
        await serviciosRef.child(serviceId).remove();
        showAlert('Servicio eliminado correctamente');
    } catch (error) {
        console.error('Error al eliminar servicio:', error);
        showAlert('Error al eliminar el servicio: ' + error.message, 'error');
    }
}

// ==========================
// Event Listeners
// ==========================
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

    if (!serviceData.nombre) {
        showAlert('El nombre del servicio es requerido', 'error');
        return;
    }

    saveService(serviceData);
});

cancelBtn.addEventListener('click', () => {
    clearForm();
});

// ==========================
// Inicializar la aplicación
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    initImageHandlers();
    loadServices();
});