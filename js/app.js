/**
 * Inicialización de la aplicación al cargar el DOM.
 * Se encarga de cargar datos, inicializar el mapa,
 * habilitar la ubicación del usuario, configurar eventos,
 * preparar la búsqueda y actualizar la interfaz de usuario.
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initMap();
  enableUserLocation();
  setupEventListeners();
  setupSearchFunctionality();
  clearHighlightedStops();
  updateUI();
});

/** 
 * Variables globales que almacenan rutas disponibles,
 * el círculo de proximidad de búsqueda, las paradas resaltadas
 * y la configuración inicial del mapa.
 */
let availableRoutes = [];
let searchProximityCircle = null;
let highlightedStops = [];
const mapSettings = {
  defaultCenter: [19.54, -96.91],
  defaultZoom: 13,
  maxZoom: 19
};
const searchAliases = {
  "caxa": "Central de Autobuses de Xalapa, Veracruz",
  "zona uv": "Zona Universitaria, Xalapa, Veracruz",
  "uv": "Universidad Veracruzana, Xalapa, Veracruz",
  "plaza crystal": "Plaza Crystal, Xalapa, Veracruz",
  "usbi": "Campus para la Cultura las Artes y el Deporte",
  "cem": "Centro de Alta Especialidad"
};

/**
 * Carga los datos de rutas y paradas desde archivos GeoJSON.
 * Detecta las rutas disponibles, obtiene la información
 * de cada ruta y sus paradas, y finalmente asigna colores.
 * 
 * @async
 * @function loadData
 */
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

/**
 * Detecta las rutas disponibles leyendo el archivo índice.
 * Actualiza la variable global `availableRoutes`.
 * 
 * @async
 * @function detectAvailableRoutes
 */
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

/**
 * Asigna colores a las rutas cargadas de forma cíclica
 * desde una paleta de colores predefinida.
 * 
 * @function assignRouteColors
 */
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

/**
 * Configura los event listeners de la aplicación,
 * incluyendo cambio de estilos del mapa, apertura/cierre
 * de la barra lateral y manejo de pestañas.
 * 
 * @function setupEventListeners
 */
function setupEventListeners() {
  document.getElementById('style-default').addEventListener('click', () => changeMapStyle('Standard'));
  document.getElementById('style-satellite').addEventListener('click', () => changeMapStyle('Satélite'));
  document.getElementById('style-dark').addEventListener('click', () => changeMapStyle('Oscuro'));

  document.getElementById('sidebar-toggle').addEventListener('click', function () {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('hidden');
    this.innerHTML = sidebar.classList.contains('hidden')
      ? '<i class="fas fa-bars"></i>'
      : '<i class="fas fa-times"></i>';
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      this.classList.add('active');
      document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');
    });
  });
}

/**
 * Actualiza la interfaz de usuario cargando rutas,
 * paradas y estadísticas.
 * 
 * @function updateUI
 */
function updateUI() {
  populateRoutesList();
  updateStats();
  loadRoutes();
  loadStops();
}

/**
 * Pobla la lista de rutas en el contenedor lateral,
 * incluyendo un elemento para mostrar todas las rutas
 * y los elementos individuales para cada ruta.
 * 
 * @function populateRoutesList
 */
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
  allItem.addEventListener('click', () => {
    // Cuando el usuario hace clic en "Todas las rutas", se limpia cualquier búsqueda previa
    document.getElementById('search-place').value = '';
    selectRoute('all');
    clearHighlightedStops();
  });
  routesContainer.appendChild(allItem);

  // Separar las rutas fijadas de las no fijadas
  const fixedRouteFeatures = [];
  const unfixedRouteFeatures = [];

  window.routesData.features.forEach(feature => {
    if (fixedRoutes.includes(feature.properties.id)) {
      fixedRouteFeatures.push(feature);
    } else {
      unfixedRouteFeatures.push(feature);
    }
  });

  // Primero, agregar las rutas fijadas
  if (fixedRouteFeatures.length > 0) {
    const fixedHeaderContainer = document.createElement('div');
    fixedHeaderContainer.className = 'fixed-header-container';
    fixedHeaderContainer.innerHTML = `
      <h5>Rutas Fijadas</h5>
      <button id="unpin-all-btn" class="unpin-all-btn">
        <i class="fas fa-thumbtack"></i> Desfijar todo
      </button>
    `;
    routesContainer.appendChild(fixedHeaderContainer);
    
    // Añadir el evento al botón de desfijar
    document.getElementById('unpin-all-btn').addEventListener('click', () => {
        clearFixedRoutes(); // Llama a la función para limpiar todas las rutas fijadas
        populateRoutesList(); // Re-renderiza la lista para actualizar la vista
    });

    fixedRouteFeatures.forEach(feature => {
      addRouteToList(feature.properties);
    });
  }

  // Luego, agregar el resto de las rutas
  const allHeader = document.createElement('h5');
  allHeader.textContent = 'Todas las Rutas';
  routesContainer.appendChild(allHeader);
  unfixedRouteFeatures.forEach(feature => {
    addRouteToList(feature.properties);
  });
}

/**
 * Agrega una ruta específica a la lista lateral
 * con información como imagen, descripción, notas
 * y cantidad de unidades por turno.
 * 
 * @param {Object} properties - Propiedades de la ruta (id, name, desc, notes, etc.)
 * @function addRouteToList
 */
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;

  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    <p>
      <strong>Imagen:</strong><br>
      ${properties.image ? `<img src="data/rutas/${properties.name}/${properties.image}" alt="${properties.name}" style="max-width:100%; height:auto;">` : '-'}
    </p>
    <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
    <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
    <p><strong>Unidades:</strong> AM:${properties.peak_am ?? 0} MD:${properties.midday ?? 0} PM:${properties.peak_pm ?? 0} NT:${properties.night ?? 0}</p>
  `;

  routeItem.addEventListener('click', () => selectRoute(properties.id));
  routesContainer.appendChild(routeItem);
}

/**
 * Actualiza las estadísticas globales de la aplicación,
 * mostrando número total de rutas y paradas.
 * 
 * @function updateStats
 */
function updateStats() {
  const totalRoutes = window.routesData.features.length;
  const totalStops = window.stopsData.features.length;

  /**
   * Función auxiliar que actualiza un elemento del DOM.
   * 
   * @param {string} id - ID del elemento a actualizar
   * @param {number} value - Valor a asignar
   */
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

/**
 * Manejo de login local con almacenamiento en `localStorage`.
 * Si hay un usuario guardado, se muestra su información
 * y la opción de cerrar sesión.
 */
const authArea = document.getElementById("auth-area");
const usuario = localStorage.getItem("usuario");

if (usuario && authArea) {
  authArea.innerHTML = `
    <div class="user-info">
      <span>👤 ${usuario}</span>
      <button onclick="cerrarSesion()">Cerrar sesión</button>
    </div>
  `;
}

/**
 * Cierra la sesión del usuario eliminando
 * su información de `localStorage` y recargando la página.
 * 
 * @function cerrarSesion
 */
function cerrarSesion() {
  localStorage.removeItem("usuario");
  window.location.reload();
}

// Función para buscar lugares y filtrar rutas
function setupSearchFunctionality() {
  const searchInput = document.getElementById('search-place');
  const searchButton = document.getElementById('search-button');

  // Evento para el botón de búsqueda
  searchButton.addEventListener('click', performSearch);

  // Evento para la tecla Enter en el input
  searchInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
}

// Realizar la búsqueda
async function performSearch() {
  const searchTerm = document.getElementById('search-place').value.trim();

  if (!searchTerm) {
    alert('Por favor, ingresa un lugar para buscar');
    return;
  }

  // Limpiar el mapa antes de cada nueva búsqueda
  selectRoute('none'); // Desactiva cualquier selección previa
  clearHighlightedStops(); // Limpia los puntos resaltados

  // Limpiar la lista de rutas para evitar superposición
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  try {
    // Primero intentamos geocodificar el término de búsqueda
    const location = await geocodeSearchTerm(searchTerm);

    if (location) {
      // Centrar el mapa en la ubicación encontrada
      map.setView([location.lat, location.lng], 16);

      // Buscar rutas cercanas a esta ubicación
      findRoutesNearLocation(location);
    } else {
      // Si no se encuentra la ubicación, buscar en nombres de rutas y descripciones
      searchInRouteData(searchTerm);
    }
  } catch (error) {
    console.error('Error en la búsqueda:', error);
    alert('Error al realizar la búsqueda. Intenta con otro término.');
  }
}

// Normaliza y reemplaza el término de búsqueda si es un alias
function normalizeSearchTerm(term) {
  const normalized = term.trim().toLowerCase();
  return searchAliases[normalized] || term; // usa alias si existe
}

// Geocodificar el término de búsqueda usando Nominatim (OpenStreetMap)
async function geocodeSearchTerm(searchTerm) {
  try {
    const normalizedTerm = normalizeSearchTerm(searchTerm);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedTerm + ', Xalapa, Veracruz')}&limit=1`);
    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error('Error en geocodificación:', error);
    return null;
  }
}

// Encontrar rutas cercanas a una ubicación
function findRoutesNearLocation(location) {
  const searchTerm = document.getElementById('search-place').value.trim();
  const proximityThreshold = 500; // metros

  // Resaltar paradas en el rango
  highlightStopsInRange(location, proximityThreshold);

  // Encontrar paradas cercanas
  const nearbyStops = allStopLayers.filter(stop => {
    const distance = calculateDistance(
      location.lat, location.lng,
      stop.coordinates[0], stop.coordinates[1]
    );
    return distance <= proximityThreshold;
  });

  // Obtener IDs de rutas únicas de las paradas cercanas
  const nearbyRouteIds = [...new Set(nearbyStops.map(stop => stop.routeId))];

  if (nearbyRouteIds.length > 0) {
    // Mostrar las rutas cercanas
    showSearchResults(nearbyRouteIds, `Rutas cerca de: ${location.displayName || 'tu búsqueda'}`);
  } else {
    // Si no hay rutas cercanas, buscar en los datos de las rutas
    searchInRouteData(searchTerm);
    alert('No se encontraron rutas cercanas a este lugar. Mostrando resultados relacionados.');
  }
}

// Buscar en los datos de las rutas (nombres, descripciones)
function searchInRouteData(searchTerm) {
  const term = searchTerm.toLowerCase();
  const matchingRoutes = [];

  // Buscar en nombres y descripciones de rutas
  window.routesData.features.forEach(feature => {
    const props = feature.properties;
    const nameMatch = props.name && props.name.toLowerCase().includes(term);
    const descMatch = props.desc && props.desc.toLowerCase().includes(term);

    if (nameMatch || descMatch) {
      matchingRoutes.push(props.id);
    }
  });

  if (matchingRoutes.length > 0) {
    showSearchResults(matchingRoutes, `Rutas relacionadas con: ${searchTerm}`);
  } else {
    alert('No se encontraron rutas relacionadas con tu búsqueda.');
    // Mostrar todas las rutas si no hay resultados
    selectRoute('all');
  }
}

// Array global para rutas fijadas
let fixedRoutes = [];
//Lista para paradas
let fixedStopsLayers = {};

// Mostrar resultados de búsqueda
function showSearchResults(routeIds, title) {
  const routesContainer = document.getElementById('routes-container');
  routesContainer.innerHTML = '';

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `
    <h3>${title}</h3>
    <button id="clear-search" class="clear-search-btn">
      <i class="fas fa-times"></i> Limpiar búsqueda
    </button>
  `;
  routesContainer.appendChild(resultsHeader);

  document.getElementById('clear-search').addEventListener('click', () => {
    document.getElementById('search-place').value = '';
    populateRoutesList();
    selectRoute('all');
    clearHighlightedStops();
  });

// Separar las rutas fijadas que coinciden con la búsqueda de las no fijadas
  const fixedMatches = [];
  const unfixedMatches = [];

  window.routesData.features.forEach(feature => {
    if (routeIds.includes(feature.properties.id)) {
      if (fixedRoutes.includes(feature.properties.id)) {
        fixedMatches.push(feature);
      } else {
        unfixedMatches.push(feature);
      }
    }
  });

  // Mostrar primero las rutas fijadas que coinciden con la búsqueda
  if (fixedMatches.length > 0) {
    const fixedHeader = document.createElement('h5');
    fixedHeader.textContent = 'Fijadas y Relacionadas';
    routesContainer.appendChild(fixedHeader);
    fixedMatches.forEach(feature => addRouteToList(feature.properties));
  }

  // Luego mostrar las rutas no fijadas que coinciden
  if (unfixedMatches.length > 0) {
    const unfixedHeader = document.createElement('h5');
    unfixedHeader.textContent = 'Resultados de la búsqueda';
    routesContainer.appendChild(unfixedHeader);
    unfixedMatches.forEach(feature => addRouteToList(feature.properties));
  }
}

function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;

  const checked = fixedRoutes.includes(properties.id) ? 'checked' : '';

  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    <p>
      <strong>Imagen:</strong><br>
      ${properties.image ? `<img src="data/rutas/${properties.name}/${properties.image}" alt="${properties.name}" style="max-width:100%; height:auto;">` : '-'}
    </p>
    <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
    <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
    <p><strong>Unidades:</strong> AM:${properties.peak_am ?? 0} MD:${properties.midday ?? 0} PM:${properties.peak_pm ?? 0} NT:${properties.night ?? 0}</p>
    <p><strong>Fijar ruta</strong><input type="checkbox" class="fix-route" ${checked}></p>
  `;

  // Si haces click en el título se selecciona ruta
  routeItem.querySelector("h4").addEventListener("click", () => {
    selectRoute(properties.id);
  });

  // Escuchar checkbox
  const checkbox = routeItem.querySelector(".fix-route");
  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      // Agregar a fijadas y dibujar en mapa
      if (!fixedRoutes.includes(properties.id)) {
        fixedRoutes.push(properties.id);
        drawRouteOnMap(properties.id);
        drawStopsOnMap(properties.id);
      }
    } else {
      // Quitar de fijadas y eliminar del mapa
      fixedRoutes = fixedRoutes.filter(id => id !== properties.id);
      removeRouteFromMap(properties.id);
      removeStopsFromMap(properties.id);
    }

    // ¡Re-renderizar la lista para actualizar el orden!
    populateRoutesList();
  });

  routesContainer.appendChild(routeItem);
}

// Objeto global para guardar las capas de cada ruta fijada
let fixedRoutesLayers = {};

// Función para dibujar la ruta
function drawRouteOnMap(routeId) {
  const feature = window.routesData.features.find(f => f.properties.id === routeId);
  if (!feature) return;

  const color = feature.properties.color || "blue";

  const layer = L.geoJSON(feature, {
    style: { color, weight: 4 }
  }).addTo(map);

  fixedRoutesLayers[routeId] = layer;
}

// Función que dibuja las paradas usando los datos globales de stopsData.
function drawStopsOnMap(routeId) {
  // Primero, encuentra las paradas que corresponden a esta ruta.
  const stopsForRoute = window.stopsData.features.filter(
    f => f.properties.routeId === routeId
  );

  if (stopsForRoute.length === 0) return;

  // Obtener el color de la ruta para los íconos de parada.
  const route = window.routesData.features.find(r => r.properties.id === routeId);
  const color = route ? route.properties.color : '#f39c12';

  const stopsLayer = L.geoJSON({
    type: "FeatureCollection",
    features: stopsForRoute
  }, {
    pointToLayer: (feature, latlng) => {
      return L.marker(latlng, {
        icon: createStopIcon(color)
      }).bindPopup(`<b>${feature.properties.name || "Parada"}</b>`);
    }
  }).addTo(map);

  // Guardar la capa para poder eliminarla más tarde.
  fixedStopsLayers[routeId] = stopsLayer;
}

// Quitar la ruta (línea y paradas) del mapa
function removeRouteFromMap(routeId) {
  const layer = fixedRoutesLayers[routeId];
  if (!layer) return;

  map.removeLayer(layer);
  delete fixedRoutesLayers[routeId];
}

function removeStopsFromMap(routeId) {
  const layer = fixedStopsLayers[routeId];
  if (!layer) return;

  map.removeLayer(layer);
  delete fixedStopsLayers[routeId];
}

/**
 * Limpia todas las rutas y paradas que han sido fijadas en el mapa.
 * Restaura el estado de la aplicación.
 */
function clearFixedRoutes() {
  // 1. Eliminar todas las capas de rutas fijadas del mapa
  for (const routeId in fixedRoutesLayers) {
    if (fixedRoutesLayers.hasOwnProperty(routeId)) {
      map.removeLayer(fixedRoutesLayers[routeId]);
    }
  }
  fixedRoutesLayers = {}; // Vacía el objeto de capas

  // 2. Eliminar todas las capas de paradas fijadas del mapa
  for (const routeId in fixedStopsLayers) {
    if (fixedStopsLayers.hasOwnProperty(routeId)) {
      map.removeLayer(fixedStopsLayers[routeId]);
    }
  }
  fixedStopsLayers = {}; // Vacía el objeto de capas

  // 3. Vaciar el arreglo de IDs de rutas fijadas
  fixedRoutes = [];

  // 4. Asegurarse de que los checkboxes en la lista se desmarquen
  document.querySelectorAll('.fix-route').forEach(checkbox => {
    checkbox.checked = false;
  });
}

//Resalta las paradas dentro de un radio específico de una ubicación
function highlightStopsInRange(location, radius = 500) {
  // Limpiar resaltados anteriores
  clearHighlightedStops();

  // Crear o actualizar el círculo de proximidad de búsqueda
  updateSearchProximityCircle(location, radius);

  // Encontrar y resaltar paradas dentro del rango
  const stopsInRange = allStopLayers.filter(stop => {
    const distance = calculateDistance(
      location.lat, location.lng,
      stop.coordinates[0], stop.coordinates[1]
    );
    return distance <= radius;
  });

  // Resaltar las paradas encontradas
  stopsInRange.forEach(stop => {
    // Cambiar el icono a uno resaltado
    const highlightIcon = createHighlightedStopIcon('#e74c3c');
    stop.marker.setIcon(highlightIcon);

    // Añadir a la lista de paradas resaltadas
    highlightedStops.push(stop);

    // Abrir popup para la parada más cercana
    if (stopsInRange.length > 0) {
      const closestStop = stopsInRange.reduce((prev, curr) => {
        const prevDist = calculateDistance(location.lat, location.lng, prev.coordinates[0], prev.coordinates[1]);
        const currDist = calculateDistance(location.lat, location.lng, curr.coordinates[0], curr.coordinates[1]);
        return prevDist < currDist ? prev : curr;
      });

      closestStop.marker.openPopup();
    }
  });

  // También resaltar en la lista del panel lateral
  highlightStopsInList(stopsInRange.map(stop => stop.id));
}


//Crea un icono resaltado para paradas
function createHighlightedStopIcon(color) {
  return L.divIcon({
    className: 'highlighted-stop-icon',
    html: `
      <div style="
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
      ">
        <div style="
          background-color: ${color};
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 0 0 3px ${color}, 0 0 10px rgba(0,0,0,0.5);
          animation: pulse 1.5s infinite;
        "></div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      </style>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}


//Actualiza el círculo de proximidad de búsqueda
function updateSearchProximityCircle(location, radius) {
  // Eliminar círculo anterior si existe
  if (searchProximityCircle) {
    map.removeLayer(searchProximityCircle);
  }

  // Crear nuevo círculo de búsqueda
  searchProximityCircle = L.circle([location.lat, location.lng], {
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.1,
    weight: 2,
    radius: radius
  }).addTo(map);

  // Añadir tooltip al círculo
  searchProximityCircle.bindTooltip(
    `Radio de búsqueda: ${radius}m`,
    { permanent: false, direction: 'center' }
  );
}


//Resalta las paradas en la lista del panel lateral
function highlightStopsInList(stopIds) {
  // Primero, quitar cualquier resaltado anterior
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
    item.style.borderLeft = 'none';
  });

  // Resaltar las paradas que están en el rango
  stopIds.forEach(id => {
    const stopItem = document.querySelector(`.stop-item[data-id="${id}"]`);
    if (stopItem) {
      stopItem.style.backgroundColor = '#fff3f3';
      stopItem.style.borderLeft = '4px solid #e74c3c';
    }
  });
}

//Limpia todos los resaltados de paradas
function clearHighlightedStops() {
  // Restaurar iconos originales de las paradas resaltadas
  highlightedStops.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    const color = route ? route.properties.color : '#f39c12';
    stop.marker.setIcon(createStopIcon(color));
  });

  // Limpiar la lista
  highlightedStops = [];

  // Eliminar el círculo de proximidad de búsqueda
  if (searchProximityCircle) {
    map.removeLayer(searchProximityCircle);
    searchProximityCircle = null;
  }

  // Quitar resaltados de la lista
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
    item.style.borderLeft = 'none';
  });
}