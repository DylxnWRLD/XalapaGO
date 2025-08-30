// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initMap();
  enableUserLocation();
  setupEventListeners();
  updateUI();
});

// Variables globales
let availableRoutes = [];
const mapSettings = {
  defaultCenter: [19.54, -96.91],
  defaultZoom: 13,
  maxZoom: 19
};

// Cargar datos de rutas y paradas
async function loadData() {
  try {
    window.routesData = { type: "FeatureCollection", features: [] };
    window.stopsData = { type: "FeatureCollection", features: [] };

    await detectAvailableRoutes();

    for (const routeId of availableRoutes) {
      try {
        const [routeResponse, stopsResponse] = await Promise.all([
          fetch(`data/rutas/${routeId}/routes.geojson`),
          fetch(`data/rutas/${routeId}/stops.geojson`)
        ]);

        const routeData = await routeResponse.json();
        const stopsData = await stopsResponse.json();

        if (routeData.features?.length > 0) {
          window.routesData.features.push(routeData.features[0]);
        }
        
        if (stopsData.features?.length > 0) {
          window.stopsData.features = window.stopsData.features.concat(stopsData.features);
        }
      } catch (error) {
        console.error(`Error al cargar la ruta ${routeId}:`, error);
      }
    }

    assignRouteColors();
  } catch (error) {
    console.error('Error al cargar los datos:', error);
  }
}

// Detectar rutas disponibles
async function detectAvailableRoutes() {
  try {
    const response = await fetch('data/rutas/index.json');
    if (!response.ok) throw new Error('No se pudo cargar el índice de rutas');

    const routeIds = await response.json();
    availableRoutes = routeIds;
  } catch (error) {
    console.error('Error al detectar rutas:', error);
    availableRoutes = [];
  }
}

// Asignar colores a las rutas
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
  document.getElementById('search-stop').addEventListener('input', filterStops);
  
  document.getElementById('style-default').addEventListener('click', () => changeMapStyle('Standard'));
  document.getElementById('style-satellite').addEventListener('click', () => changeMapStyle('Satélite'));
  document.getElementById('style-dark').addEventListener('click', () => changeMapStyle('Oscuro'));

  document.getElementById('sidebar-toggle').addEventListener('click', function() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('hidden');
    this.innerHTML = sidebar.classList.contains('hidden') 
      ? '<i class="fas fa-bars"></i>' 
      : '<i class="fas fa-times"></i>';
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
}

// Actualizar la interfaz de usuario
function updateUI() {
  populateRoutesList();
  updateStats();
  loadRoutes();
  loadStops();
}

// Poblar la lista de rutas
function populateRoutesList() {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  // Ítem para mostrar todas las rutas
  const allItem = document.createElement('div');
  allItem.className = 'route-item route-item--all';
  allItem.innerHTML = `
    <h4><i class="fas fa-layer-group"></i> Todas las rutas</h4>
    <p>Ver todas las rutas y paradas</p>
  `;
  allItem.addEventListener('click', () => selectRoute('all'));
  routesContainer.appendChild(allItem);

  // Rutas individuales
  window.routesData.features.forEach(feature => {
    addRouteToList(feature.properties);
  });
}

// Añadir ruta a la lista
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;
  
  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
    <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
    <p><strong>Unidades:</strong> AM:${properties.peak_am ?? 0} MD:${properties.midday ?? 0} PM:${properties.peak_pm ?? 0} NT:${properties.night ?? 0}</p>
  `;
  
  routeItem.addEventListener('click', () => selectRoute(properties.id));
  routesContainer.appendChild(routeItem);
}

// Actualizar estadísticas
function updateStats() {
  const totalRoutes = window.routesData.features.length;
  const totalStops = window.stopsData.features.length;

  // Función auxiliar para actualizar elementos
  const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  updateElement('total-routes-count', totalRoutes);
  updateElement('total-stops-count', totalStops);
  updateElement('info-total-routes', totalRoutes);
  updateElement('info-total-stops', totalStops);
  updateElement('stats-total-routes', totalRoutes);
  updateElement('stats-total-stops', totalStops);
}