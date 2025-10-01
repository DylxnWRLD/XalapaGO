// =============================================
// VARIABLES GLOBALES
// =============================================

// Instancia principal del mapa Leaflet
let map;

// Almacenamiento de capas visibles actualmente
let routeLayers = [];    // Capas de rutas visibles
let stopLayers = [];     // Capas de paradas visibles

// Almacenamiento de todas las capas (independientemente de su visibilidad)
let allRouteLayers = []; // Todas las capas de rutas
let allStopLayers = [];  // Todas las capas de paradas

// Estado de la aplicación
let selectedRoute = 'all';          // Ruta seleccionada ('all' para todas)
let baseLayers = {};                // Capas base disponibles
let userLocationCircle = null;      // Círculo de radio de proximidad
let nearestStopMarker = null;       // Marcador de parada más cercana
let currentUserLocation = null;     // Ubicación actual del usuario

// Variables para destino final
let destinationMarker = null;       // Marcador de destino final
let selectedDestination = null;     // Información del destino seleccionado

// =============================================
// INICIALIZACIÓN DEL MAPA
// =============================================

/**
 * Inicializa el mapa Leaflet con configuración básica, capas base y límites geográficos
 */
function initMap() {
  // Definir los límites geográficos para Xalapa y sus alrededores
  // Coordenadas aproximadas que cubren Xalapa y zona metropolitana
  const xalapaBounds = L.latLngBounds(
    [19.45, -96.98], // Esquina suroeste (lat, lng)
    [19.65, -96.82]  // Esquina noreste (lat, lng)
  );

  // Crear mapa centrado en Xalapa con límites geográficos
  map = L.map('map', {
    center: [19.54, -96.91],
    zoom: 13,
    maxBounds: xalapaBounds,           // Límites del área visible
    maxBoundsViscosity: 1.0,          // Qué tan "pegajosos" son los límites (1.0 = muy restrictivo)
    minZoom: 11,                      // Zoom mínimo (vista general de Xalapa)
    maxZoom: 18,                      // Zoom máximo (vista detallada)
    zoomControl: true,                // Mantener controles de zoom
    scrollWheelZoom: true,            // Permitir zoom con rueda del ratón
    doubleClickZoom: true,            // Permitir zoom con doble clic
    touchZoom: true                   // Permitir zoom táctil en móviles
  });

  // Configurar capas base disponibles con límites aplicados
  baseLayers = {
    "Standard": createTileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      '&copy; OpenStreetMap contributors'
    ),
    "Satélite": createTileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    ),
    "Oscuro": createTileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      '&copy; OpenStreetMap contributors &copy; CARTO'
    )
  };

  // Añadir capa base por defecto
  baseLayers.Standard.addTo(map);

  // Configurar eventos para actualizar visibilidad según zoom
  map.on('zoomend', function () {
    updateNearestStopVisibility();
    updateDestinationVisibility();
  });

  // Evento opcional: mostrar alerta si el usuario intenta salir de los límites
  map.on('drag', function () {
    map.panInsideBounds(xalapaBounds, { animate: false });
  });

  // Ajustar la vista inicial para mostrar toda el área permitida
  map.fitBounds(xalapaBounds);
}

// =============================================
// FUNCIONES DE UTILERÍA
// =============================================

/**
 * Crea una capa de teselas para el mapa
 * @param {string} url - URL de la plantilla de teselas
 * @param {string} attribution - Texto de atribución
 * @returns {L.TileLayer} Capa de teselas configurada
 */
function createTileLayer(url, attribution) {
  return L.tileLayer(url, {
    maxZoom: 19,
    attribution: attribution
  });
}

/**
 * Crea un icono personalizado para las paradas
 * @param {string} color - Color del icono (hexadecimal)
 * @returns {L.DivIcon} Icono personalizado para marcadores
 */
function createStopIcon(color) {
  return L.divIcon({
    className: 'stop-icon',
    html: `<div class="stop-icon-inner" style="background-color: ${color}; border: 2px solid white; box-shadow: 0 0 0 2px ${color}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

/**
 * Elimina todas las capas especificadas del mapa
 * @param {Array} layers - Array de capas a eliminar
 */
function clearLayers(layers) {
  layers.forEach(layer => map.removeLayer(layer));
}

// =============================================
// GESTIÓN DE RUTAS
// =============================================

/**
 * Carga y muestra las rutas en el mapa
 */
function loadRoutes() {
  // Limpiar rutas existentes
  clearLayers(routeLayers);
  routeLayers = [];
  allRouteLayers = [];

  // Procesar cada ruta del dataset
  window.routesData.features.forEach(feature => {
    const routeLayer = createRouteLayer(feature);

    // Guardar referencia a la capa para uso futuro
    allRouteLayers.push({
      id: feature.properties.id,
      layer: routeLayer
    });
  });
}

/**
 * Crea una capa GeoJSON para una ruta específica
 * @param {Object} feature - Feature GeoJSON con datos de la ruta
 * @returns {L.GeoJSON} Capa GeoJSON configurada
 */
function createRouteLayer(feature) {
  return L.geoJSON(feature, {
    style: {
      color: feature.properties.color,
      weight: 4,
      opacity: 0.8
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createRoutePopupContent(feature));
    }
  });
}

/**
 * Genera el contenido HTML para el popup de una ruta
 * @param {Object} feature - Feature GeoJSON con datos de la ruta
 * @returns {string} Contenido HTML para el popup
 */
function createRoutePopupContent(feature) {
  const props = feature.properties;

  const v = props && props.mujer_segura;
  const isSafe = (v === true) || (String(v).toLowerCase() === 'si') || (String(v).toLowerCase() === 'sí');

  return `
    <div class="route-popup">
      <h3 class="route-popup-title">${props.name}</h3>
      <p><strong>Descripción:</strong> ${props.desc ?? '-'}</p>

      <div class="kv">
        <span class="kv-label">¿Versión “Mujer segura”?</span>
        <span class="badge ${isSafe ? 'ok' : 'no'}">${isSafe ? 'Sí' : 'No'}</span>
      </div>

      <p><strong>Notas:</strong> ${props.notes ?? '-'}</p>
      <p><strong>Horario Pico AM:</strong> ${props.peak_am ?? '—'} unidades</p>
      <p><strong>Mediodía:</strong> ${props.midday ?? '—'} unidades</p>
      <p><strong>Horario Pico PM:</strong> ${props.peak_pm ?? '—'} unidades</p>
      <p><strong>Noche:</strong> ${props.night ?? '—'} unidades</p>
    </div>
  `;
}


/**
 * Muestra todas las rutas en el mapa
 */
function showAllRoutes() {
  // Limpiar rutas actuales
  clearLayers(routeLayers);
  routeLayers = [];

  // Añadir todas las rutas al mapa
  allRouteLayers.forEach(route => {
    route.layer.addTo(map);
    routeLayers.push(route.layer);
  });
}

/**
 * Muestra una sola ruta específica en el mapa
 * @param {string} routeId - ID de la ruta a mostrar
 */
function showSingleRoute(routeId) {
  // Limpiar rutas actuales
  clearLayers(routeLayers);
  routeLayers = [];

  // Buscar y mostrar la ruta específica
  const route = allRouteLayers.find(r => r.id === routeId);
  if (route) {
    route.layer.addTo(map);
    routeLayers.push(route.layer);
    map.fitBounds(route.layer.getBounds());
  }
}

// =============================================
// FUNCIONES DE DESTINO FINAL
// =============================================

/**
 * Crea un marcador personalizado para el destino final con etiqueta horizontal
 * @param {Array} coordinates - Coordenadas [lat, lng] del destino
 * @param {Object} stopData - Datos de la parada de destino
 * @returns {L.Marker} Marcador de destino personalizado
 */
function createDestinationMarker(coordinates, stopData) {
  return L.marker(coordinates, {
    icon: L.divIcon({
      className: 'destination-marker',
      html: `
        <div class="destination-marker-container">
          <div class="destination-label">DESTINO</div>
          <div class="destination-pin">
            <div class="destination-pin-inner"></div>
          </div>
        </div>
      `,
      iconSize: [120, 70],
      iconAnchor: [60, 70]
    })
  });
}

/**
 * Actualiza la visibilidad del marcador de destino según el nivel de zoom
 */
function updateDestinationVisibility() {
  if (!destinationMarker || !selectedDestination) return;

  const currentZoom = map.getZoom();

  // Mostrar/ocultar según el zoom para evitar interferencia visual
  if (currentZoom >= 15) {
    if (!map.hasLayer(destinationMarker)) {
      destinationMarker.addTo(map);
    }
  } else {
    if (map.hasLayer(destinationMarker)) {
      map.removeLayer(destinationMarker);
    }
  }
}

/**
 * Establece una parada como destino final con visibilidad adaptable
 * @param {string} stopId - ID de la parada a establecer como destino
 */
function setDestination(stopId) {
  // Encontrar la parada en la lista
  const stopData = allStopLayers.find(stop => stop.id === stopId);
  if (!stopData) {
    console.error("Parada no encontrada:", stopId);
    return;
  }

  // Remover marcador de destino anterior si existe
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
  }

  // Crear nuevo marcador de destino con etiqueta horizontal
  destinationMarker = createDestinationMarker(stopData.coordinates, stopData);

  // Agregar popup con información de destino
  const routeData = window.routesData.features.find(r => r.properties.id === stopData.routeId);
  const routeColor = routeData ? routeData.properties.color : '#f39c12';
  const routeName = routeData ? routeData.properties.name : 'Desconocida';

  const popupContent = `
    <div class="destination-popup">
      <h3 class="destination-popup-title">DESTINO FINAL</h3>
      <div class="destination-popup-info">
        <p><strong><i class="fas fa-map-marker-alt"></i> Parada #${stopData.properties.sequence}</strong></p>
        <p><strong>Ruta:</strong> <span style="color: ${routeColor};">${routeName}</span></p>
        <hr class="destination-popup-divider">
        <p class="destination-popup-note">Esta es tu parada de destino seleccionada</p>
      </div>
      <div class="destination-popup-actions">
        <button onclick="clearDestination()" class="clear-destination-btn">Quitar Destino</button>
      </div>
    </div>
  `;

  destinationMarker.bindPopup(popupContent);

  // Solo agregar al mapa si el zoom es apropiado
  const currentZoom = map.getZoom();
  if (currentZoom >= 14) {
    destinationMarker.addTo(map);
  }

  // Guardar información del destino
  selectedDestination = {
    id: stopId,
    data: stopData,
    routeData: routeData
  };

  // Actualizar el popup de la parada original para mostrar que está seleccionada como destino
  updateStopPopupWithDestination(stopId);

  console.log("Destino establecido:", stopData.properties);
}

/**
 * Limpia el destino actual
 */
function clearDestination() {
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }

  if (selectedDestination) {
    // Restaurar popup original de la parada
    updateStopPopupWithDestination(selectedDestination.id, false);
    selectedDestination = null;
  }
}

/**
 * Actualiza el popup de una parada para incluir/excluir información de destino
 * @param {string} stopId - ID de la parada
 * @param {boolean} isDestination - Si la parada es destino o no
 */
function updateStopPopupWithDestination(stopId, isDestination = true) {
  const stopData = allStopLayers.find(stop => stop.id === stopId);
  if (!stopData) return;

  const routeData = window.routesData.features.find(r => r.properties.id === stopData.routeId);
  const routeColor = routeData ? routeData.properties.color : '#f39c12';
  const routeName = routeData ? routeData.properties.name : 'Desconocida';

  let popupContent = `
    <div class="stop-popup">
      <h3 class="stop-popup-title">Parada #${stopData.properties.sequence}</h3>
      <p><strong>Ruta:</strong> <span style="color: ${routeColor};">${routeName}</span></p>
  `;

  if (isDestination) {
    popupContent += `
      <div class="stop-destination-indicator">
        <p class="stop-destination-text">ESTABLECIDA COMO DESTINO</p>
      </div>
      <div class="stop-popup-actions">
        <button onclick="clearDestination()" class="clear-destination-btn">Quitar Destino</button>
      </div>
    `;
  } else {
    popupContent += `
      <div class="stop-popup-actions">
        <button onclick="setDestination('${stopId}')" class="set-destination-btn">Marcar como Destino</button>
      </div>
    `;
  }

  popupContent += `</div>`;

  // Actualizar el popup del marcador
  stopData.marker.setPopupContent(popupContent);
}

// =============================================
// GESTIÓN DE PARADAS
// =============================================

/**
 * Carga y muestra las paradas en el mapa y panel lateral
 */
function loadStops() {
  // Limpiar paradas existentes
  clearLayers(stopLayers);
  stopLayers = [];
  allStopLayers = [];

  // Limpiar lista de paradas en el panel lateral
  const stopsContainer = document.getElementById('stops-container');
  stopsContainer.innerHTML = '';

  // Procesar cada parada del dataset
  window.stopsData.features.forEach(feature => {
    const stop = feature;
    const routeId = stop.properties.routeId;

    // Obtener color de la ruta correspondiente
    const route = window.routesData.features.find(r => r.properties.id === routeId);
    const color = route ? route.properties.color : '#f39c12';

    // Crear marcador con funcionalidad de destino
    const marker = createStopMarker(stop, color);

    // Guardar referencia a la capa
    allStopLayers.push({
      id: stop.properties.id,
      routeId: routeId,
      sequence: stop.properties.sequence,
      marker: marker,
      properties: stop.properties,
      coordinates: [stop.geometry.coordinates[1], stop.geometry.coordinates[0]]
    });

    // Añadir a la lista en el panel lateral
    addStopToList(stop.properties, color);

    // Configurar evento para resaltar la parada al hacer clic
    marker.on('click', () => highlightStop(stop.properties.id));
  });
}

/**
 * Crea un marcador para una parada con funcionalidad de destino
 * @param {Object} stop - Datos de la parada
 * @param {string} color - Color del marcador
 * @returns {L.Marker} Marcador configurado
 */
function createStopMarker(stop, color) {
  const marker = L.marker(
    [stop.geometry.coordinates[1], stop.geometry.coordinates[0]],
    { icon: createStopIcon(color) }
  );

  // Obtener datos de la ruta
  const routeData = window.routesData.features.find(r => r.properties.id === stop.properties.routeId);
  const routeName = routeData ? routeData.properties.name : 'Desconocida';

  // Contenido del popup con botón de destino
  const popupContent = `
    <div class="stop-popup">
      <h3 class="stop-popup-title">Parada #${stop.properties.sequence}</h3>
      <p><strong>Ruta:</strong> <span style="color: ${color};">${routeName}</span></p>
      <div class="stop-popup-actions">
        <button onclick="setDestination('${stop.properties.id}')" class="set-destination-btn">Marcar como Destino</button>
      </div>
    </div>
  `;

  marker.bindPopup(popupContent);
  return marker;
}

/**
 * Muestra todas las paradas en el mapa
 */
function showAllStops() {
  // Limpiar paradas actuales
  clearLayers(stopLayers);
  stopLayers = [];

  // Añadir todas las paradas al mapa
  allStopLayers.forEach(stop => {
    stop.marker.addTo(map);
    stopLayers.push(stop.marker);
  });
}

/**
 * Muestra solo las paradas de una ruta específica
 * @param {string} routeId - ID de la ruta
 */
function showSingleRouteStops(routeId) {
  // Limpiar paradas actuales
  clearLayers(stopLayers);
  stopLayers = [];

  // Filtrar y mostrar solo paradas de la ruta especificada
  allStopLayers.forEach(stop => {
    if (stop.routeId === routeId) {
      stop.marker.addTo(map);
      stopLayers.push(stop.marker);
    }
  });
}

// =============================================
// INTERFAZ DE USUARIO
// =============================================

/**
 * Cambia el estilo del mapa base
 * @param {string} style - Nombre del estilo a aplicar
 */
function changeMapStyle(style) {
  // Remover todas las capas base actuales
  Object.values(baseLayers).forEach(layer => {
    map.removeLayer(layer);
  });

  // Añadir la capa seleccionada
  baseLayers[style].addTo(map);

  // Actualizar estado visual de los botones
  document.querySelectorAll('.style-button').forEach(btn => {
    btn.classList.remove('active');
  });

  const styleButton = document.getElementById(`style-${style.toLowerCase()}`);
  if (styleButton) {
    styleButton.classList.add('active');
  }
}

/**
 * Selecciona una ruta y actualiza la visualización con manejo de destino
 * @param {string} routeId - ID de la ruta a seleccionar ('all' para todas)
 */
function selectRoute(routeId) {
  // Verificar si el destino actual pertenece a la ruta seleccionada
  if (selectedDestination && routeId !== 'all') {
    const destinationRoute = selectedDestination.data.routeId;
    if (destinationRoute !== routeId) {
      // El destino no pertenece a la ruta seleccionada, mostrar advertencia
      const shouldKeep = confirm(
        `Tu destino actual está en la ruta "${destinationRoute}" pero has seleccionado la ruta "${routeId}". ¿Deseas mantener el destino actual?`
      );

      if (!shouldKeep) {
        clearDestination();
      }
    }
  }

  selectedRoute = routeId;

  // Actualizar el selector para reflejar la selección
  const routeSelect = document.getElementById('route-select');
  if (routeSelect) {
    routeSelect.value = routeId;
  }

  // Mostrar u ocultar rutas según la selección
  if (routeId === 'all') {
    showAllRoutes();
    showAllStops();

    // Ajustar vista para mostrar todas las rutas
    if (allRouteLayers.length > 0) {
      const group = L.featureGroup(allRouteLayers.map(r => r.layer));
      map.fitBounds(group.getBounds());
    }
  } else if (routeId === 'none') {
    // Limpiar el mapa
    clearLayers(routeLayers);
    clearLayers(stopLayers);
    routeLayers = [];
    stopLayers = [];
  }
  else {
    showSingleRoute(routeId);
    showSingleRouteStops(routeId);
  }

  // Actualizar lista de paradas en el panel lateral
  updateStopsList(routeId);

  // Actualizar parada más cercana si hay ubicación del usuario
  if (currentUserLocation) {
    updateNearestStop();
  }
}

/**
 * Actualiza la lista de paradas en el panel lateral según la ruta seleccionada
 * @param {string} routeId - ID de la ruta para filtrar
 */
function updateStopsList(routeId) {
  const stopsContainer = document.getElementById('stops-container');
  stopsContainer.innerHTML = ''; // Limpiar lista

  let stopsToShow = allStopLayers;

  // Filtrar paradas si no se seleccionó "todas"
  if (routeId !== 'all') {
    stopsToShow = allStopLayers.filter(stop => stop.routeId === routeId);
  }

  // Añadir cada parada a la lista
  stopsToShow.forEach(stop => {
    const routeColor = window.routesData.features.find(r => r.properties.id === stop.routeId)?.properties.color ?? '#f39c12';
    addStopToList(stop.properties, routeColor);
  });
}

/**
 * Añade una parada a la lista del panel lateral
 * @param {Object} properties - Propiedades de la parada
 * @param {string} color - Color asociado a la ruta
 */
function addStopToList(properties, color) {
  const stopsContainer = document.getElementById('stops-container');
  const stopItem = document.createElement('div');
  stopItem.className = 'stop-item';
  stopItem.dataset.id = properties.id;
  stopItem.dataset.route = properties.routeId;

  // Estructura HTML para el elemento de parada
  stopItem.innerHTML = `
    <h4><i class="fas fa-map-marker-alt"></i> Parada #${properties.sequence}</h4>
    <p><strong>Ruta:</strong> ${properties.routeId}</p>
    <p><strong>ID:</strong> ${properties.id}</p>
  `;

  // Configurar evento para centrar mapa en la parada al hacer clic
  stopItem.addEventListener('click', function () {
    highlightStop(properties.id);
    const stopLayer = allStopLayers.find(s => s.id === properties.id);
    if (stopLayer) {
      map.setView(stopLayer.marker.getLatLng(), 16);
      stopLayer.marker.openPopup();
    }
  });

  stopsContainer.appendChild(stopItem);
}

/**
 * Resalta una parada específica en el mapa y panel lateral
 * @param {string} stopId - ID de la parada a resaltar
 */
function highlightStop(stopId) {
  // Restablecer todas las paradas a su apariencia normal
  allStopLayers.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    const color = route ? route.properties.color : '#f39c12';
    stop.marker.setIcon(createStopIcon(color));
  });

  // Restablecer todos los elementos de la lista
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
  });

  // Resaltar la parada seleccionada
  const selected = allStopLayers.find(stop => stop.id === stopId);
  if (selected) {
    selected.marker.setIcon(createStopIcon('#2ecc71'));
    const selectedItem = document.querySelector(`.stop-item[data-id="${stopId}"]`);
    if (selectedItem) selectedItem.style.backgroundColor = '#f0f7ff';
  }
}

// =============================================
// FUNCIONES DE UTILIDAD PARA DESTINO
// =============================================

/**
 * Obtiene información del destino actual
 * @returns {Object|null} Información del destino o null si no hay destino
 */
function getCurrentDestination() {
  return selectedDestination;
}

/**
 * Centra el mapa en el destino actual
 */
function focusOnDestination() {
  if (selectedDestination && destinationMarker) {
    map.setView(selectedDestination.data.coordinates, 16);
    destinationMarker.openPopup();
  }
}

/**
 * Verifica si una parada está establecida como destino
 * @param {string} stopId - ID de la parada a verificar
 * @returns {boolean} True si la parada es el destino actual
 */
function isDestination(stopId) {
  return selectedDestination && selectedDestination.id === stopId;
}

// =============================================
// FUNCIONALIDAD DE UBICACIÓN Y PROXIMIDAD
// =============================================

/**
 * Calcula la distancia entre dos puntos geográficos (fórmula de Haversine)
 * @param {number} lat1 - Latitud del primer punto
 * @param {number} lng1 - Longitud del primer punto
 * @param {number} lat2 - Latitud del segundo punto
 * @param {number} lng2 - Longitud del segundo punto
 * @returns {number} Distancia en metros
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en metros
}

/**
 * Crea o actualiza el círculo de proximidad alrededor del usuario
 * @param {number} lat - Latitud del centro del círculo
 * @param {number} lng - Longitud del centro del círculo
 */
function updateProximityCircle(lat, lng) {
  // Remover círculo existente
  if (userLocationCircle) {
    map.removeLayer(userLocationCircle);
  }

  // Crear nuevo círculo de 500 metros
  userLocationCircle = L.circle([lat, lng], {
    color: '#3498db',
    fillColor: '#3498db',
    fillOpacity: 0.1,
    weight: 2,
    radius: 500
  }).addTo(map);
}

/**
 * Encuentra la parada más cercana a la ubicación del usuario
 * @param {number} userLat - Latitud del usuario
 * @param {number} userLng - Longitud del usuario
 * @returns {Object|null} Objeto con información de la parada y distancia, o null si no hay paradas
 */
function findNearestStop(userLat, userLng) {
  let relevantStops = [];

  // Filtrar paradas según la ruta seleccionada
  if (selectedRoute === 'all') {
    relevantStops = allStopLayers;
  } else {
    relevantStops = allStopLayers.filter(stop => stop.routeId === selectedRoute);
  }

  if (relevantStops.length === 0) return null;

  // Calcular distancias y encontrar la más cercana
  let nearestStop = null;
  let minDistance = Infinity;

  relevantStops.forEach(stop => {
    const distance = calculateDistance(
      userLat, userLng,
      stop.coordinates[0], stop.coordinates[1]
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearestStop = stop;
    }
  });

  return { stop: nearestStop, distance: minDistance };
}

/**
 * Crea un marcador especial para la parada más cercana
 * @param {Object} stop - Datos de la parada
 * @param {number} distance - Distancia a la parada en metros
 * @returns {L.Marker} Marcador especial con animaciones
 */
function createNearestStopMarker(stop, distance) {
  const routeColor = window.routesData.features.find(r => r.properties.id === stop.routeId)?.properties.color ?? '#f39c12';

  return L.marker(stop.coordinates, {
    icon: L.divIcon({
      className: 'nearest-stop-marker',
      html: `
        <div class="nearest-stop-container">
          <div class="nearest-stop-label">
            <div><i class="fas fa-bus"></i> PARADA MÁS CERCANA</div>
            <div class="nearest-stop-distance">${Math.round(distance)}m</div>
          </div>
          <div class="nearest-stop-icon" style="background-color: ${routeColor}"></div>
        </div>
      `,
      iconSize: [200, 90],
      iconAnchor: [100, 80]
    })
  });
}

/**
 * Actualiza la visibilidad del marcador de parada cercana según el nivel de zoom
 */
function updateNearestStopVisibility() {
  if (!nearestStopMarker || !currentUserLocation) return;

  const currentZoom = map.getZoom();

  // Solo mostrar el marcador especial cuando el zoom sea 15 o mayor
  if (currentZoom >= 15) {
    if (!map.hasLayer(nearestStopMarker)) {
      nearestStopMarker.addTo(map);
    }
  } else {
    if (map.hasLayer(nearestStopMarker)) {
      map.removeLayer(nearestStopMarker);
    }
  }
}

/**
 * Actualiza la parada más cercana basada en la ubicación actual del usuario
 */
function updateNearestStop() {
  if (!currentUserLocation) return;

  // Remover marcador anterior de parada más cercana
  if (nearestStopMarker) {
    map.removeLayer(nearestStopMarker);
    nearestStopMarker = null;
  }
  
  // Condición para solo buscar parada si hay rutas VISIBLES
  if (routeLayers.length === 0) {
    return;
  }

  // Encontrar la parada más cercana
  const result = findNearestStop(currentUserLocation.lat, currentUserLocation.lng);

  if (result && result.distance <= 500) { // Solo mostrar si está dentro de 500m
    nearestStopMarker = createNearestStopMarker(result.stop, result.distance);

    // Solo agregar al mapa si el zoom es apropiado
    const currentZoom = map.getZoom();
    if (currentZoom >= 14) {
      nearestStopMarker.addTo(map);
    }

    // Agregar popup con información detallada
    const popupContent = `
      <div class="nearest-stop-popup">
        <h3 class="nearest-stop-popup-title">Parada Más Cercana</h3>
        <p><strong>Parada #${result.stop.properties.sequence}</strong></p>
        <p><strong>Ruta:</strong> ${result.stop.routeId}</p>
        <p><strong>Distancia:</strong> ${Math.round(result.distance)} metros</p>
        <p class="nearest-stop-walk-time">Tiempo caminando: ~${Math.round(result.distance / 83)} minutos</p>
      </div>
    `;
    nearestStopMarker.bindPopup(popupContent);
  }
}

/**
 * Habilita el seguimiento de la ubicación del usuario en tiempo real
 */
function enableUserLocation() {
  if (!map) return;

  // Usar la API de Geolocation del navegador
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      function (position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Guardar ubicación actual
        currentUserLocation = { lat, lng };

        // Si ya existe el marcador, actualizar su posición
        if (window.userMarker) {
          window.userMarker.setLatLng([lat, lng]);
        } else {
          // Crear un marcador personalizado para la ubicación del usuario
          window.userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'user-location-marker',
              html: `
                <div class="user-location-pin">
                  <div class="user-location-pin-inner"></div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 24]
            })
          }).addTo(map);

          // Agregar evento de clic para hacer zoom a la ubicación
          window.userMarker.on('click', function () {
            map.setView([lat, lng], 17, {
              animate: true,
              duration: 0.5
            });
          });

          // Hacer zoom a la ubicación la primera vez
          map.setView([lat, lng], 15);
        }

        // Actualizar círculo de proximidad
        updateProximityCircle(lat, lng);

        // Actualizar parada más cercana
        updateNearestStop();
      },
      function (error) {
        console.error("Error al obtener ubicación:", error);
        alert("No se pudo obtener tu ubicación.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000
      }
    );
  } else {
    alert("La geolocalización no es soportada en este navegador.");
  }
}