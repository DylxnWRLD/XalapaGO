// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async function() {
  // Cargar datos de rutas y paradas
  await loadData();
  
  // Inicializar el mapa
  initMap();
  
  // Configurar eventos
  setupEventListeners();
  
  // Actualizar la interfaz
  updateUI();
});

// Variables globales
let availableRoutes = [];
let mapSettings = {
  defaultCenter: [19.54, -96.91],
  defaultZoom: 13,
  maxZoom: 19
};

// Cargar datos de rutas y paradas
async function loadData() {
  try {
    window.routesData = {
      type: "FeatureCollection",
      features: []
    };
    
    window.stopsData = {
      type: "FeatureCollection",
      features: []
    };
    
    // Primero, detectar las rutas disponibles
    await detectAvailableRoutes();
    
    // Cargar cada ruta y sus paradas
    for (const routeId of availableRoutes) {
      try {
        // Cargar ruta
        const routeResponse = await fetch(`data/rutas/${routeId}/routes.geojson`);
        const routeData = await routeResponse.json();
        
        // Cargar paradas
        const stopsResponse = await fetch(`data/rutas/${routeId}/stops.geojson`);
        const stopsData = await stopsResponse.json();
        
        // Agregar a los datos globales
        if (routeData.features && routeData.features.length > 0) {
          window.routesData.features.push(routeData.features[0]);
        }
        
        if (stopsData.features && stopsData.features.length > 0) {
          window.stopsData.features = window.stopsData.features.concat(stopsData.features);
        }
      } catch (error) {
        console.error(`Error al cargar la ruta ${routeId}:`, error);
      }
    }
    
    // Asignar colores aleatorios a las rutas
    assignRouteColors();
    
  } catch (error) {
    console.error('Error al cargar los datos:', error);
  }
}

// Detectar rutas disponibles automáticamente
async function detectAvailableRoutes() {
  try {
    // En un entorno real, necesitarías un backend para listar directorios
    // Por ahora, usaremos un enfoque con intentos de carga
    
    // Rutas comunes a intentar cargar
    const commonRoutes = ['10001', '10002', '10003', '10004', '10005', '13936318'];
    const detectedRoutes = [];
    
    // Verificar qué rutas existen
    for (const routeId of commonRoutes) {
      try {
        const testResponse = await fetch(`data/rutas/${routeId}/routes.geojson`);
        if (testResponse.ok) {
          detectedRoutes.push(routeId);
        }
      } catch (error) {
        // Ignorar errores, la ruta probablemente no existe
      }
    }
    
    // Si no detectamos rutas, usar valores por defecto
    availableRoutes = detectedRoutes.length > 0 ? detectedRoutes : ['10001', '10002', '10003'];
    
  } catch (error) {
    console.error('Error al detectar rutas:', error);
    availableRoutes = ['10001', '10002', '10003'];
  }
}

// Asignar colores aleatorios a las rutas
function assignRouteColors() {
  const colors = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', 
    '#1abc9c', '#d35400', '#c0392b', '#16a085', '#27ae60',
    '#8e44ad', '#f1c40f', '#e67e22', '#7f8c8d', '#34495e'
  ];
  
  window.routesData.features.forEach((feature, index) => {
    feature.properties.color = colors[index % colors.length];
  });
}

// Configurar event listeners
function setupEventListeners() {
  // Configurar eventos de filtrado
  document.getElementById('search-stop').addEventListener('input', filterStops);
  
  // Configurar eventos para los botones de estilo
  document.getElementById('style-default').addEventListener('click', () => changeMapStyle('Standard'));
  document.getElementById('style-satellite').addEventListener('click', () => changeMapStyle('Satélite'));
  document.getElementById('style-dark').addEventListener('click', () => changeMapStyle('Oscuro'));
  
  // Configurar evento para el botón de toggle del sidebar
  document.getElementById('sidebar-toggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('hidden');
    this.innerHTML = document.querySelector('.sidebar').classList.contains('hidden') ? 
      '<i class="fas fa-bars"></i>' : '<i class="fas fa-times"></i>';
  });
  
  // Configurar pestañas
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      // Desactivar todas las pestañas
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Activar la pestaña seleccionada
      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
}

// Actualizar la interfaz de usuario
function updateUI() {
  // Generar botones de selección de ruta
  generateRouteButtons();
  
  // Añadir rutas a la lista
  window.routesData.features.forEach(feature => {
    addRouteToList(feature.properties);
  });
  
  // Actualizar estadísticas
  updateStats();
  
  // Cargar rutas y paradas en el mapa
  loadRoutes();
  loadStops();
}

// Generar botones de selección de ruta
function generateRouteButtons() {
  const routeSelector = document.getElementById('route-selector');
  
  // Limpiar botones existentes
  routeSelector.innerHTML = '';
  
  // Añadir botón "Todas"
  const allButton = document.createElement('button');
  allButton.className = 'route-btn active';
  allButton.dataset.route = 'all';
  allButton.textContent = 'Todas las rutas';
  allButton.addEventListener('click', function() {
    selectRoute('all');
  });
  routeSelector.appendChild(allButton);
  
  // Añadir botones para cada ruta usando la descripción
  window.routesData.features.forEach(feature => {
    const routeId = feature.properties.id;
    // Usar la descripción en lugar del nombre
    const routeDescription = feature.properties.desc || feature.properties.name;
    
    const button = document.createElement('button');
    button.className = 'route-btn';
    button.dataset.route = routeId;
    button.textContent = routeDescription;
    button.title = `Ruta: ${feature.properties.name}`; // Tooltip con el nombre real
    
    button.addEventListener('click', function() {
      selectRoute(routeId);
    });
    
    routeSelector.appendChild(button);
  });
}

// Añadir ruta a la lista del panel lateral
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;
  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    <p><strong>Descripción:</strong> ${properties.desc}</p>
    <p><strong>Notas:</strong> ${properties.notes}</p>
    <p><strong>Unidades:</strong> AM:${properties.peak_am} MD:${properties.midday} PM:${properties.peak_pm} NT:${properties.night}</p>
  `;
  
  // Añadir evento para seleccionar la ruta al hacer clic
  routeItem.addEventListener('click', function() {
    selectRoute(properties.id);
  });
  
  routesContainer.appendChild(routeItem);
}

// Actualizar estadísticas
function updateStats() {
  const totalRoutes = window.routesData.features.length;
  const totalStops = window.stopsData.features.length;
  
  // Actualizar en el panel de información
  document.getElementById('total-routes-count').textContent = totalRoutes;
  document.getElementById('total-stops-count').textContent = totalStops;
  
  // Actualizar en el panel de información
  document.getElementById('info-total-routes').textContent = totalRoutes;
  document.getElementById('info-total-stops').textContent = totalStops;
  
  // Actualizar en el panel de estadísticas
  document.getElementById('stats-total-routes').textContent = totalRoutes;
  document.getElementById('stats-total-stops').textContent = totalStops;
}