document.addEventListener("DOMContentLoaded", () => {

    // --- Inicialización del mapa ---
    const map = L.map('map').setView([19.54, -96.91], 13);
    map.invalidateSize();

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let drawnItems = new L.FeatureGroup().addTo(map);

    // --- Configuración de Leaflet Draw ---
    let drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polyline: {
                shapeOptions: { color: 'red', weight: 5, dashArray: '5,5' },
                title: "Dibujar ruta"
            },
            polygon: false,
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: {
                shapeOptions: { color: 'blue' },
                title: "Agregar parada"
            }
        }
    });

    map.addControl(drawControl);

    // --- Variables de control ---
    let nextRouteId = 14010000;
    let nextStopId = 14020000;
    let rutas = [];
    let rutaSeleccionada = null;
    let stopsSequence = 0;

    // --- Manejo de eventos de dibujo ---
    map.on(L.Draw.Event.CREATED, e => {
        const layer = e.layer;

        // Para rutas (polilíneas)
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            let descripcion = prompt("Descripción de la ruta (opcional):");

            layer.feature = {
                type: "Feature",
                properties: {
                    id: (nextRouteId++).toString(),
                    name: `Ruta ${rutaSeleccionada}`,
                    desc: descripcion || "", 
                    image: null,
                    notes: null,
                    peak_am: 10,
                    midday: 10,
                    peak_pm: 10,
                    night: 10
                },
                geometry: {
                    type: "LineString",
                    coordinates: layer.getLatLngs().map(ll => [ll.lng, ll.lat])
                }
            };
        }

        // Si es un marcador (parada)
        if (layer instanceof L.Marker) {
            if (!rutaSeleccionada) {
                alert("Selecciona una ruta antes de colocar paradas");
                return;
            }
            layer.feature = {
                type: "Feature",
                properties: {
                    id: (nextStopId++).toString(),
                    routeId: rutas.find(r => r === rutaSeleccionada)?.id || (nextRouteId - 1).toString(),
                    sequence: stopsSequence++,
                    travelTime: 0,
                    dwellTime: 0,
                    arrivalTim: 0,
                    departureT: 0,
                    passengerA: 0,
                    passengerB: 0
                },
                geometry: {
                    type: "Point",
                    coordinates: [layer.getLatLng().lng, layer.getLatLng().lat]
                }
            };
        }

        drawnItems.addLayer(layer);
    });

    // Eventos de edición y eliminación (solo logueo en consola)
    map.on(L.Draw.Event.EDITED, e => e.layers.eachLayer(layer => console.log("Editado:", layer)));
    map.on(L.Draw.Event.DELETED, e => e.layers.eachLayer(layer => console.log("Eliminado:", layer)));

    // ---------------- RUTAS ----------------

    /**
     * Carga el archivo index.json con la lista de rutas disponibles
     * y actualiza la lista visible en el DOM.
     */
    async function cargarIndex() {
        try {
            const res = await fetch("/data/rutas/index.json");
            rutas = await res.json();
            mostrarListaRutas();
        } catch (err) {
            console.error("No se pudo cargar index.json", err);
        }
    }

    /**
     * Muestra en la página la lista de rutas disponibles.
     * Marca la ruta seleccionada y permite seleccionar otra al hacer click.
     */
    function mostrarListaRutas() {
        const ul = document.getElementById("listaRutas");
        ul.innerHTML = "";
        rutas.forEach(ruta => {
            const li = document.createElement("li");
            li.textContent = ruta;
            if (ruta === rutaSeleccionada) li.classList.add("selected");
            li.addEventListener("click", () => cargarRutaSeleccionada(ruta));
            ul.appendChild(li);
        });
    }

    /**
     * Carga los archivos GeoJSON de rutas y paradas de la ruta seleccionada.
     * Limpia el mapa y reinicia la secuencia de paradas.
     */
    async function cargarRutaSeleccionada(carpeta) {
        rutaSeleccionada = carpeta;
        drawnItems.clearLayers();
        stopsSequence = 0;
        mostrarListaRutas();
        await cargarRuta(`/data/rutas/${carpeta}/routes.geojson`);
        await cargarRuta(`/data/rutas/${carpeta}/stops.geojson`);
    }

    /**
     * Carga un archivo GeoJSON y agrega sus elementos al mapa.
     */
    async function cargarRuta(archivo) {
        try {
            const res = await fetch(archivo);
            const data = await res.json();
            L.geoJSON(data, { onEachFeature: (feature, layer) => drawnItems.addLayer(layer) });
        } catch (err) {
            console.warn("No se pudo cargar:", archivo);
        }
    }

    // ---------------- BOTONES ----------------

    /**
     * Crea una nueva ruta pidiendo un nombre al usuario.
     * Valida que no exista previamente y limpia el mapa para comenzar a dibujar.
     */
    document.getElementById("nuevaRuta").addEventListener("click", () => {
        const nombre = prompt("Nombre de la nueva ruta (ej: 10004)");
        if (!nombre) return;
        if (rutas.includes(nombre)) return alert("Ya existe una ruta con ese nombre");
        rutas.push(nombre);
        rutaSeleccionada = nombre;
        stopsSequence = 0;
        drawnItems.clearLayers();
        mostrarListaRutas();
    });

    /**
     * Elimina la ruta seleccionada después de confirmación del usuario.
     * Limpia el mapa y la lista de rutas.
     */
    document.getElementById("eliminarRuta").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");
        if (!confirm(`Se eliminará la ruta ${rutaSeleccionada}. ¿Continuar?`)) return;
        rutas = rutas.filter(r => r !== rutaSeleccionada);
        rutaSeleccionada = null;
        stopsSequence = 0;
        drawnItems.clearLayers();
        mostrarListaRutas();
    });

    /**
     * Descarga las rutas y paradas como archivos GeoJSON separados.
     * Filtra los elementos por tipo de geometría.
     */
    document.getElementById("downloadGeoJSON").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");

        const geojson = drawnItems.toGeoJSON();

        const rutasGeoJSON = {
            type: "FeatureCollection",
            features: geojson.features.filter(f => f.geometry.type === "LineString")
        };
        const paradasGeoJSON = {
            type: "FeatureCollection",
            features: geojson.features.filter(f => f.geometry.type === "Point")
        };

        const blobRutas = new Blob([JSON.stringify(rutasGeoJSON, null, 2)], { type: "application/json" });
        const aRutas = document.createElement("a");
        aRutas.href = URL.createObjectURL(blobRutas);
        aRutas.download = "routes.geojson";
        aRutas.click();

        const blobParadas = new Blob([JSON.stringify(paradasGeoJSON, null, 2)], { type: "application/json" });
        const aParadas = document.createElement("a");
        aParadas.href = URL.createObjectURL(blobParadas);
        aParadas.download = "stops.geojson";
        aParadas.click();
    });

    // Carga inicial del índice de rutas
    cargarIndex();
});
