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

// =============================================
// INICIALIZACIÓN DEL MAPA
// =============================================

/**
 * Inicializa el mapa Leaflet con configuración básica y capas base
 */
function initMap() {
  // Crear mapa centrado en Veracruz, México con zoom inicial 13
  map = L.map('map').setView([19.54, -96.91], 16);
  
  // Configurar capas base disponibles
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
  
  // Configurar evento para actualizar visibilidad de parada cercana al cambiar zoom
  map.on('zoomend', updateNearestStopVisibility);
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
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 2px ${color}"></div>`,
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
  
  // Mostrar todas las rutas inicialmente
  showAllRoutes();
  
  // Ajustar vista del mapa para mostrar todas las rutas
  if (allRouteLayers.length > 0) {
    const group = L.featureGroup(allRouteLayers.map(r => r.layer));
    map.fitBounds(group.getBounds());
  }
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
  return `
    <div style="min-width: 200px;">
      <h3 style="margin: 0 0 10px 0; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">
        ${props.name}
      </h3>
      <p><strong>Descripción:</strong> ${props.desc}</p>
      <p><strong>Notas:</strong> ${props.notes}</p>
      <p><strong>Horario Pico AM:</strong> ${props.peak_am} unidades</p>
      <p><strong>Mediodía:</strong> ${props.midday} unidades</p>
      <p><strong>Horario Pico PM:</strong> ${props.peak_pm} unidades</p>
      <p><strong>Noche:</strong> ${props.night} unidades</p>
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
    
    // Crear marcador para la parada
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
  
  // Mostrar todas las paradas inicialmente
  showAllStops();
}

/**
 * Crea un marcador para una parada
 * @param {Object} stop - Datos de la parada
 * @param {string} color - Color del marcador
 * @returns {L.Marker} Marcador configurado
 */
function createStopMarker(stop, color) {
  const marker = L.marker(
    [stop.geometry.coordinates[1], stop.geometry.coordinates[0]],
    { icon: createStopIcon(color) }
  );
  
  // Contenido básico para el popup
  const info = `
    <div style="min-width: 180px; padding: 10px;">
      <h3 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; text-align: center;">
        Parada #${stop.properties.sequence}
      </h3>
    </div>
  `;
  
  marker.bindPopup(info);
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
 * Selecciona una ruta y actualiza la visualización
 * @param {string} routeId - ID de la ruta a seleccionar ('all' para todas)
 */
function selectRoute(routeId) {
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
  } else {
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
  stopItem.addEventListener('click', function() {
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
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
        <div style="
          position: relative;
          text-align: center;
          font-family: Arial, sans-serif;
        ">
          <!-- Mensaje encima -->
          <div style="
            background: linear-gradient(135deg, #2c5aa0, #2c5aa0);
            color: white;
            padding: 10px 18px;
            border-radius: 25px;
            font-size: 12px;
            font-weight: bold;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(231, 76, 60, 0.4);
            margin-bottom: 8px;
            border: 2px solid white;
            animation: bounce 2s infinite;
            min-width: 180px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          ">
            <div><i class="fas fa-bus"></i> PARADA MÁS CERCANA</div>
            <div style="margin-top: 2px;">📍 ${Math.round(distance)}m</div>
          </div>
          <!-- Icono de parada -->
          <div style="
            background-color: ${routeColor}; 
            width: 20px; 
            height: 20px; 
            border-radius: 50%; 
            border: 3px solid #e74c3c; 
            box-shadow: 0 0 0 3px white, 0 0 15px rgba(231, 76, 60, 0.6);
            margin: 0 auto;
            animation: pulse 1.5s infinite;
          "></div>
        </div>
        <style>
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-5px); }
            60% { transform: translateY(-3px); }
          }
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
          }
        </style>
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
      <div style="text-align: center; min-width: 200px; font-family: Arial, sans-serif;">
        <h3 style="color: #2c5aa0; margin: 0 0 10px 0;"><i class="fas fa-bus"></i> Parada Más Cercana</h3>
        <p><strong>Parada #${result.stop.properties.sequence}</strong></p>
        <p><strong>Ruta:</strong> ${result.stop.routeId}</p>
        <p><strong>Distancia:</strong> ${Math.round(result.distance)} metros</p>
        <p style="color: #27ae60; font-size: 12px; margin: 10px 0 0 0;">
          ⏱️ Tiempo caminando: ~${Math.round(result.distance / 83)} minutos
        </p>
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
      function(position) {
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
              className: 'user-location',
              html: `
                <div style="
                  position: relative;
                  width: 26px;
                  height: 26px;
                  background-color: #e74c3c;
                  border: 2px solid black;
                  border-radius: 50% 50% 50% 0;
                  transform: rotate(-45deg);
                  box-shadow: 0 0 10px rgba(231, 76, 60, 0.8);
                ">
                  <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(45deg);
                    width: 10px;
                    height: 10px;
                    background: black;
                    border-radius: 50%;
                  "></div>
                </div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 24]
            })
          }).addTo(map);

          // Hacer zoom a la ubicación la primera vez
          map.setView([lat, lng], 15);
        }
        
        // Actualizar círculo de proximidad
        updateProximityCircle(lat, lng);
        
        // Actualizar parada más cercana
        updateNearestStop();
      },
      function(error) {
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