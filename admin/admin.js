// Ejecuta el codigo una vez que el DOM ha cargado por completo
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================================
    // ------------------- INICIALIZACION MAPA ------------------
    // ==========================================================

    // Crear mapa centrado en coordenadas (Xalapa, Ver.) con zoom 13
    const map = L.map('map').setView([19.54, -96.91], 13);
    map.invalidateSize();

    // Cargar tiles desde OpenStreetMap con atribucion
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Contenedor de las capas dibujadas (rutas y paradas)
    let drawnItems = new L.FeatureGroup().addTo(map);

    // ==========================================================
    // ---------------- CONFIGURACION LEAFLET DRAW --------------
    // ==========================================================

    // Herramientas de dibujo: polilineas (rutas) y marcadores (paradas)
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

    // ==========================================================
    // ------------------- VARIABLES DE CONTROL -----------------
    // ==========================================================

    let nextRouteId = 14010000;    // ID inicial para rutas
    let nextStopId = 14020000;     // ID inicial para paradas
    let rutas = [];                // Lista de nombres de rutas
    let rutaSeleccionada = null;   // Ruta actualmente seleccionada
    let stopsSequence = 0;         // Contador de secuencia de paradas

    // ==========================================================
    // ------------------ EVENTOS DE DIBUJO ---------------------
    // ==========================================================

    map.on(L.Draw.Event.CREATED, e => {
        const layer = e.layer;

        // --- Si es una RUTA (polilinea) ---
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            let descripcion = prompt("Descripción de la ruta (opcional):");

            // Asignar propiedades en formato GeoJSON
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

        // --- Si es una PARADA (marcador) ---
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

        // Agregar capa dibujada al mapa
        drawnItems.addLayer(layer);
    });

    // Log de edicion y eliminacion en consola
    map.on(L.Draw.Event.EDITED, e => e.layers.eachLayer(layer => console.log("Editado:", layer)));
    map.on(L.Draw.Event.DELETED, e => e.layers.eachLayer(layer => console.log("Eliminado:", layer)));

    // ==========================================================
    // ------------------- MANEJO DE RUTAS ----------------------
    // ==========================================================

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
     * Muestra en la pagina la lista de rutas disponibles.
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
     * Carga los archivos GeoJSON (rutas y paradas) de la ruta seleccionada.
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

    // ==========================================================
    // ------------------- BOTONES DEL SIDEBAR ------------------
    // ==========================================================

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
     * Elimina la ruta seleccionada despues de confirmacion del usuario.
     * Limpia el mapa y la lista de rutas.
     */
    document.getElementById("eliminarRuta").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");
        if (!confirm(`Se eliminara la ruta ${rutaSeleccionada}. ¿Continuar?`)) return;
        rutas = rutas.filter(r => r !== rutaSeleccionada);
        rutaSeleccionada = null;
        stopsSequence = 0;
        drawnItems.clearLayers();
        mostrarListaRutas();
    });

    /**
     * Descarga las rutas y paradas como archivos GeoJSON separados.
     * Filtra los elementos por tipo de geometria.
     */
    document.getElementById("downloadGeoJSON").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");

        const geojson = drawnItems.toGeoJSON();

        // Rutas (LineString)
        const rutasGeoJSON = {
            type: "FeatureCollection",
            features: geojson.features.filter(f => f.geometry.type === "LineString")
        };
        const blobRutas = new Blob([JSON.stringify(rutasGeoJSON, null, 2)], { type: "application/json" });
        const aRutas = document.createElement("a");
        aRutas.href = URL.createObjectURL(blobRutas);
        aRutas.download = "routes.geojson";
        aRutas.click();

        // Paradas (Point)
        const paradasGeoJSON = {
            type: "FeatureCollection",
            features: geojson.features.filter(f => f.geometry.type === "Point")
        };
        const blobParadas = new Blob([JSON.stringify(paradasGeoJSON, null, 2)], { type: "application/json" });
        const aParadas = document.createElement("a");
        aParadas.href = URL.createObjectURL(blobParadas);
        aParadas.download = "stops.geojson";
        aParadas.click();
    });

    // ==========================================================
    // ------------------ CARGA INICIAL -------------------------
    // ==========================================================

    // Cargar indice de rutas al iniciar la aplicacion
    cargarIndex();
});
