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
  
  // Capas base
  baseLayers = {
    "Standard": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }),
    "Satélite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }),
    "Oscuro": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    })
  };
  
  // Añadir capa base por defecto
  baseLayers["Standard"].addTo(map);
}

// Iconos para las paradas
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
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
  allRouteLayers = [];
  
  // Limpiar leyenda
  const legendItems = document.getElementById('legend-items');
  legendItems.innerHTML = '';
  
  // Añadir las rutas al mapa
  window.routesData.features.forEach(feature => {
    const routeLayer = L.geoJSON(feature, {
      style: {
        color: feature.properties.color,
        weight: 4,
        opacity: 0.8
      },
      onEachFeature: function (feature, layer) {
        let info = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 10px 0; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">
              ${feature.properties.name}
            </h3>
            <p><strong>Descripción:</strong> ${feature.properties.desc}</p>
            <p><strong>Notas:</strong> ${feature.properties.notes}</p>
            <p><strong>Horario Pico AM:</strong> ${feature.properties.peak_am} unidades</p>
            <p><strong>Mediodía:</strong> ${feature.properties.midday} unidades</p>
            <p><strong>Horario Pico PM:</strong> ${feature.properties.peak_pm} unidades</p>
            <p><strong>Noche:</strong> ${feature.properties.night} unidades</p>
          </div>
        `;
        layer.bindPopup(info);
      }
    });
    
    // Guardar referencia a la capa
    allRouteLayers.push({
      id: feature.properties.id,
      layer: routeLayer
    });
    
    // Añadir a la leyenda
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-color" style="background: ${feature.properties.color};"></span>
      <span class="legend-label">${feature.properties.name}</span>
    `;
    legendItems.appendChild(legendItem);
  });
  
  // Añadir elemento de leyenda para paradas
  const stopsLegendItem = document.createElement('div');
  stopsLegendItem.className = 'legend-item';
  stopsLegendItem.innerHTML = `
    <span class="legend-color" style="background: #f39c12;"></span>
    <span class="legend-label">Paradas</span>
  `;
  legendItems.appendChild(stopsLegendItem);
  
  // Mostrar todas las rutas inicialmente
  showAllRoutes();
  
  // Ajustar el mapa para mostrar todas las rutas
  if (allRouteLayers.length > 0) {
    const group = new L.featureGroup(allRouteLayers.map(r => r.layer));
    map.fitBounds(group.getBounds());
  }
}

// Mostrar todas las rutas
function showAllRoutes() {
  // Limpiar rutas actuales
  routeLayers.forEach(layer => map.removeLayer(layer));
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
  routeLayers.forEach(layer => map.removeLayer(layer));
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
  stopLayers.forEach(layer => map.removeLayer(layer));
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
    const marker = L.marker(
      [stop.geometry.coordinates[1], stop.geometry.coordinates[0]],
      { icon: createStopIcon(color) }
    );
    
    // Información específica para el popup (solo Parada #, Ruta e ID)
    let info = `
      <div style="min-width: 180px; padding: 10px;">
        <h3 style="margin: 0 0 12px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px; text-align: center;">
          Parada #${stop.properties.sequence}
        </h3>
        <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #2c5aa0;">Ruta:</strong> ${routeId}</p>
        <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #2c5aa0;">ID:</strong> ${stop.properties.id}</p>
      </div>
    `;
    marker.bindPopup(info);
    
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
    marker.on('click', function() {
      highlightStop(stop.properties.id);
    });
  });
  
  // Mostrar todas las paradas inicialmente
  showAllStops();
}

// Mostrar todas las paradas
function showAllStops() {
  // Limpiar paradas actuales
  stopLayers.forEach(layer => map.removeLayer(layer));
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
  stopLayers.forEach(layer => map.removeLayer(layer));
  stopLayers = [];
  
  // Encontrar y mostrar solo las paradas de la ruta específica
  allStopLayers.forEach(stop => {
    if (stop.routeId === routeId) {
      stop.marker.addTo(map);
      stopLayers.push(stop.marker);
    }
  });
}

// Cambiar estilo del mapa
function changeMapStyle(style) {
  // Remover todas las capas base
  for (const layer of Object.values(baseLayers)) {
    map.removeLayer(layer);
  }
  
  // Añadir la capa seleccionada
  baseLayers[style].addTo(map);
  
  // Actualizar botones activos
  document.querySelectorAll('.style-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`style-${style.toLowerCase()}`).classList.add('active');
}

// Seleccionar ruta
function selectRoute(routeId) {
  selectedRoute = routeId;
  
  // Actualizar botones activos
  document.querySelectorAll('.route-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.route-btn[data-route="${routeId}"]`).classList.add('active');
  
  // Mostrar u ocultar rutas y paradas según la selección
  if (routeId === 'all') {
    showAllRoutes();
    showAllStops();
    
    // Ajustar el mapa para mostrar todas las rutas
    if (allRouteLayers.length > 0) {
      const group = new L.featureGroup(allRouteLayers.map(r => r.layer));
      map.fitBounds(group.getBounds());
    }
  } else {
    showSingleRoute(routeId);
    showSingleRouteStops(routeId);
  }
}