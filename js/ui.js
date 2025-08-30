// Añadir parada a la lista del panel lateral
function addStopToList(properties, color) {
  const stopsContainer = document.getElementById('stops-container');
  const stopItem = document.createElement('div');
  stopItem.className = 'stop-item';
  stopItem.dataset.id = properties.id;
  stopItem.dataset.route = properties.routeId;
  
  // Mostrar Parada #
  stopItem.innerHTML = `
    <h4><i class="fas fa-map-marker-alt"></i> Parada #${properties.sequence}</h4>
    <p><strong>Ruta:</strong> ${properties.routeId}</p>
    <p><strong>ID:</strong> ${properties.id}</p>
  `;
  
  // Añadir evento para resaltar la parada al hacer clic
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

// Resaltar parada seleccionada
function highlightStop(stopId) {
  // Restablecer todas las paradas
  allStopLayers.forEach(stop => {
    const route = window.routesData.features.find(r => r.properties.id === stop.routeId);
    const color = route ? route.properties.color : '#f39c12';
    stop.marker.setIcon(createStopIcon(color));
  });
  
  document.querySelectorAll('.stop-item').forEach(item => {
    item.style.backgroundColor = 'white';
  });
  
  // Resaltar la parada seleccionada
  const selected = allStopLayers.find(stop => stop.id === stopId);
  if (selected) {
    selected.marker.setIcon(createStopIcon('#2ecc71'));
    document.querySelector(`.stop-item[data-id="${stopId}"]`).style.backgroundColor = '#f0f7ff';
  }
}

// Filtrar paradas
function filterStops() {
  const searchText = document.getElementById('search-stop').value.toLowerCase();
  
  allStopLayers.forEach(stop => {
    const idMatch = stop.id.toLowerCase().includes(searchText);
    const sequenceMatch = stop.sequence.toString().includes(searchText);
    
    const stopItem = document.querySelector(`.stop-item[data-id="${stop.id}"]`);
    if (stopItem) {
      if (idMatch || sequenceMatch) {
        stopItem.style.display = 'block';
      } else {
        stopItem.style.display = 'none';
      }
    }
  });
}