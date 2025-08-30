// Variables globales
let map;
let routeLayers = [];
let stopLayers = [];
let selectedRoute = 'all';
let baseLayers = {};
let allRouteLayers = []; // Almacenar todas las capas de rutas
let allStopLayers = [];  // Almacenar todas las capas de paradas

// Inicializar el mapa
function initMap() {
  map = L.map('map').setView([19.54, -96.91], 13);
  
  // Configuración de capas base
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
}

// Función auxiliar para crear capas de teselas
function createTileLayer(url, attribution) {
  return L.tileLayer(url, {
    maxZoom: 19,
    attribution: attribution
  });
}

// Crear icono para las paradas
function createStopIcon(color) {
  return L.divIcon({
    className: 'stop-icon',
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 2px ${color}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

// Cargar y mostrar rutas
function loadRoutes() {
  // Limpiar rutas existentes
  clearLayers(routeLayers);
  routeLayers = [];
  allRouteLayers = [];
  
  // Añadir las rutas al mapa
  window.routesData.features.forEach(feature => {
    const routeLayer = createRouteLayer(feature);
    
    // Guardar referencia a la capa
    allRouteLayers.push({
      id: feature.properties.id,
      layer: routeLayer
    });
  });
  
  // Mostrar todas las rutas inicialmente
  showAllRoutes();
  
  // Ajustar el mapa para mostrar todas las rutas
  if (allRouteLayers.length > 0) {
    const group = L.featureGroup(allRouteLayers.map(r => r.layer));
    map.fitBounds(group.getBounds());
  }
}

// Crear capa de ruta
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

// Crear contenido para el popup de ruta
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

// Mostrar todas las rutas
function showAllRoutes() {
  // Limpiar rutas actuales
  clearLayers(routeLayers);
  routeLayers = [];
  
  // Añadir todas las rutas
  allRouteLayers.forEach(route => {
    route.layer.addTo(map);
    routeLayers.push(route.layer);
  });
}

// Mostrar solo una ruta específica
function showSingleRoute(routeId) {
  // Limpiar rutas actuales
  clearLayers(routeLayers);
  routeLayers = [];
  
  // Encontrar y mostrar la ruta específica
  const route = allRouteLayers.find(r => r.id === routeId);
  if (route) {
    route.layer.addTo(map);
    routeLayers.push(route.layer);
    map.fitBounds(route.layer.getBounds());
  }
}

// Cargar y mostrar paradas
function loadStops() {
  // Limpiar paradas existentes
  clearLayers(stopLayers);
  stopLayers = [];
  allStopLayers = [];
  
  const stopsContainer = document.getElementById('stops-container');
  stopsContainer.innerHTML = '';
  
  window.stopsData.features.forEach(feature => {
    const stop = feature;
    const routeId = stop.properties.routeId;
    
    // Obtener color de la ruta
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
      properties: stop.properties
    });
    
    // Añadir a la lista en el panel lateral con información específica
    addStopToList(stop.properties, color);
    
    // Evento para resaltar la parada al hacer clic
    marker.on('click', () => highlightStop(stop.properties.id));
  });
  
  // Mostrar todas las paradas inicialmente
  showAllStops();
}

// Crear marcador de parada
function createStopMarker(stop, color) {
  const marker = L.marker(
    [stop.geometry.coordinates[1], stop.geometry.coordinates[0]],
    { icon: createStopIcon(color) }
  );
  
  // Información específica para el popup (solo Parada #, Ruta e ID)
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

// Mostrar todas las paradas
function showAllStops() {
  // Limpiar paradas actuales
  clearLayers(stopLayers);
  stopLayers = [];
  
  // Añadir todas las paradas
  allStopLayers.forEach(stop => {
    stop.marker.addTo(map);
    stopLayers.push(stop.marker);
  });
}

// Mostrar solo las paradas de una ruta específica
function showSingleRouteStops(routeId) {
  // Limpiar paradas actuales
  clearLayers(stopLayers);
  stopLayers = [];
  
  // Encontrar y mostrar solo las paradas de la ruta específica
  allStopLayers.forEach(stop => {
    if (stop.routeId === routeId) {
      stop.marker.addTo(map);
      stopLayers.push(stop.marker);
    }
  });
}

// Función auxiliar para limpiar capas
function clearLayers(layers) {
  layers.forEach(layer => map.removeLayer(layer));
}

// Cambiar estilo del mapa
function changeMapStyle(style) {
  // Remover todas las capas base
  Object.values(baseLayers).forEach(layer => {
    map.removeLayer(layer);
  });
  
  // Añadir la capa seleccionada
  baseLayers[style].addTo(map);
  
  // Actualizar botones activos
  document.querySelectorAll('.style-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const styleButton = document.getElementById(`style-${style.toLowerCase()}`);
  if (styleButton) {
    styleButton.classList.add('active');
  }
}

// Seleccionar ruta
function selectRoute(routeId) {
  selectedRoute = routeId;
  
  // Actualizar el selector para reflejar la selección
  const routeSelect = document.getElementById('route-select');
  if (routeSelect) {
    routeSelect.value = routeId;
  }
  
  // Mostrar u ocultar rutas y paradas según la selección
  if (routeId === 'all') {
    showAllRoutes();
    showAllStops();
    
    // Ajustar el mapa para mostrar todas las rutas
    if (allRouteLayers.length > 0) {
      const group = L.featureGroup(allRouteLayers.map(r => r.layer));
      map.fitBounds(group.getBounds());
    }
  } else {
    showSingleRoute(routeId);
    showSingleRouteStops(routeId);
  }
}

// Resaltar parada (función pendiente de implementación)
function highlightStop(stopId) {
  // Implementar lógica para resaltar parada
  console.log(`Resaltando parada: ${stopId}`);
}

// Añadir parada a la lista (función pendiente de implementación)
function addStopToList(properties, color) {
  // Implementar lógica para añadir parada a la lista
  console.log(`Añadiendo parada a la lista: ${properties.id}`);
}

// Mostrar ubicación en tiempo real
function enableUserLocation() {
  if (!map) return;

  // Usar la API de Geolocation
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Si ya existe el marcador, actualizar su posición
        if (window.userMarker) {
          window.userMarker.setLatLng([lat, lng]);
        } else {
          // Crear un marcador para la ubicación del usuario
          window.userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'user-location',
              html: `<div style="background-color:#3498db; width:20px; height:20px; border-radius:50%; border:2px solid yellow; box-shadow:0 0 6px rgba(186, 34, 158, 0.5);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })
          }).addTo(map);

          // Hacer zoom a la ubicación la primera vez
          map.setView([lat, lng], 15);
        }
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

