/**
 * Esta funcion se encarga de añadir una parada al contenedor de paradas en el panel lateral y ademas 
 * cuando se hace clic en alguna parada se muestra un recuadro con la informacion de la parada y ruta,
 * esto sirve para marcar una parada y saber en donde debes bajarte del camion.
 * 
 * @param {Object} properties objeto con los datos de las paradas
 */
function addStopToList(properties) {
  const stopsContainer = document.getElementById('stops-container');
  const stopItem = document.createElement('div');
  stopItem.className = 'stop-item';
  stopItem.dataset.id = properties.id;
  stopItem.dataset.route = properties.routeId;
  
  // Mostrar el numero de la Parada
  stopItem.innerHTML = `
    <h4><i class="fas fa-map-marker-alt"></i> Parada #${properties.sequence}</h4>
    <p><strong>Ruta:</strong> ${properties.routeId}</p>
    <p><strong>ID:</strong> ${properties.id}</p>
  `;
  
  // se añade un evento para resaltar la parada al hacer clic
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
 * Esta funcion se encarga de añadir una ruta al contenedor de rutas en el panel lateral y poder 
 * seleccionar una rutal hacer clic sobre su recuadro.
 * 
 * @param {object} properties objeto que contiene toda la informacion sobre las rutas 
 */
function addRouteToList(properties) {
  const routesContainer = document.getElementById('routes-container');
  const routeItem = document.createElement('div');
  routeItem.className = 'route-item';
  routeItem.dataset.id = properties.id;

const routeFolder = String(properties.name || properties.id || '').trim(); 
const rawImg = (properties.image || '').trim();
let imgSrc = '';

if (!rawImg) {
  imgSrc = `data/rutas/${routeFolder}/bus${routeFolder}.jpg`;
} else if (/^(https?:)?\/\//.test(rawImg) || rawImg.includes('/')) {
  imgSrc = rawImg;
} else {
  imgSrc = `data/rutas/${routeFolder}/${rawImg}`;
}

const imgHtml = `
  <p>
    <strong>Imagen:</strong><br>
    <img class="route-img"
         src="${imgSrc}"
         alt="${properties.name || properties.id}"
         style="max-width:100%; height:auto; border-radius:8px; margin:.25rem 0 .5rem;"
         onerror="
           // 1) si falla .jpg/.jpeg minúsculas -> intenta mayúsculas
           if (!this.dataset.up) { this.dataset.up = 1;
             this.src = this.src.replace(/\\.jpg$/,'\\.JPG').replace(/\\.jpeg$/i,'\\.JPEG'); return;
           }
           // 2) si falla, intenta .png
           if (!this.dataset.png) { this.dataset.png = 1;
             this.src = this.src.replace(/\\.(jpg|jpeg)$/i,'.png').replace(/\\.(JPG|JPEG)$/i,'.PNG'); return;
           }
           // 3) si también falla, muestra guión
           const p = this.closest('p'); if (p) p.innerHTML = '-';
         ">
  </p>
`;


  // Mujer segura…
  const v = properties.mujer_segura;
  const isSafe = (v === true) || (String(v).toLowerCase() === 'si') || (String(v).toLowerCase() === 'sí');

  routeItem.innerHTML = `
    <h4><i class="fas fa-route"></i> ${properties.name}</h4>
    ${imgHtml}
    <p><strong>Descripción:</strong> ${properties.desc ?? '-'}</p>
    <p><strong>Notas:</strong> ${properties.notes ?? '-'}</p>
    <div class="kv">
      <span class="kv-label">¿Versión “Mujer segura”?</span>
      <span class="badge ${isSafe ? 'ok' : 'no'}">${isSafe ? 'Sí' : 'No'}</span>
    </div>
    <p><strong>Unidades:</strong>
      AM:${properties.peak_am ?? '—'}
      MD:${properties.midday ?? '—'}
      PM:${properties.peak_pm ?? '—'}
      NT:${properties.night ?? '—'}
    </p>
  `;

  routeItem.addEventListener('click', function () { selectRoute(properties.id); });
  routesContainer.appendChild(routeItem);
}



/**
 * la funcion se encarga de resaltar la parada seleccionada en el panel lateral y en el mapa
 * ademas de restablecer las demas paradas a su estado original (color e icono).
 * 
 * @param {string} stopId id de la parada seleccionada
 */
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
