// Ejecuta el codigo una vez que el DOM ha cargado por completo
document.addEventListener("DOMContentLoaded", () => {

    // ==========================================================
    // ------------------- INICIALIZACION MAPA ------------------
    // ==========================================================

    let rutasTemp = {}; // Almacena rutas y paradas temporalmente

    const map = L.map('map').setView([19.54, -96.91], 13);
    map.invalidateSize();

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let drawnItems = new L.FeatureGroup().addTo(map);

    // ==========================================================
    // ---------------- CONFIGURACION LEAFLET DRAW --------------
    // ==========================================================

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

    let nextRouteId = 14010000;
    let nextStopId = 14020000;
    let rutas = [];
    let rutaSeleccionada = null;
    let stopsSequence = 0;

    // ==========================================================
    // ------------------ EVENTOS DE DIBUJO ---------------------
    // ==========================================================

    map.on(L.Draw.Event.CREATED, e => {
        const layer = e.layer;

        // --- Si es una RUTA (polilinea) ---
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
            let descripcion = prompt("Descripcion de la ruta (opcional):");

            layer.feature = {
                type: "Feature",
                properties: {
                    id: (nextRouteId++).toString(),
                    name: rutaSeleccionada,
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

            const routeLayer = drawnItems.getLayers().find(l =>
                l.feature?.geometry?.type === "LineString" &&
                l.feature?.properties?.name === rutaSeleccionada
            );

            if (!routeLayer) {
                alert("Primero dibuja la ruta antes de agregar paradas");
                return;
            }

            const latlng = layer.getLatLng();
            const point = turf.point([latlng.lng, latlng.lat]);
            const line = turf.lineString(routeLayer.getLatLngs().map(ll => [ll.lng, ll.lat]));
            const bufferedLine = turf.buffer(line, 0.02, { units: 'kilometers' });

            if (!turf.booleanPointInPolygon(point, bufferedLine)) {
                alert("La parada debe estar sobre la ruta");
                return;
            }

            layer.feature = {
                type: "Feature",
                properties: {
                    id: (nextStopId++).toString(),
                    routeId: routeLayer.feature.properties.id,
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
                    coordinates: [latlng.lng, latlng.lat]
                }
            };
        }

        drawnItems.addLayer(layer);
        guardarRutaTemporal(); // Guardar cada cambio
    });

    map.on(L.Draw.Event.EDITED, e => {
        e.layers.eachLayer(layer => console.log("Editado:", layer));
        guardarRutaTemporal();
    });
    map.on(L.Draw.Event.DELETED, e => {
        e.layers.eachLayer(layer => console.log("Eliminado:", layer));
        guardarRutaTemporal();
    });

    // ==========================================================
    // ------------------- FUNCIONES AUXILIARES -----------------
    // ==========================================================

    function guardarRutaTemporal() {
        if (!rutaSeleccionada) return;

        const layersClonados = [];
        drawnItems.eachLayer(layer => {
            const clone = L.GeoJSON.geometryToLayer(layer.toGeoJSON());
            clone.feature = JSON.parse(JSON.stringify(layer.feature));
            layersClonados.push(clone);
        });

        rutasTemp[rutaSeleccionada] = layersClonados;
    }

    // ==========================================================
    // ------------------- MANEJO DE RUTAS ----------------------
    // ==========================================================

    async function cargarIndex() {
        try {
            const res = await fetch("../data/rutas/index.json");
            rutas = await res.json();
            mostrarListaRutas();
        } catch (err) {
            console.error("No se pudo cargar index.json", err);
        }
    }

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

    async function cargarRutaSeleccionada(carpeta) {
        rutaSeleccionada = carpeta;
        drawnItems.clearLayers();
        stopsSequence = 0;
        mostrarListaRutas();

        if (rutasTemp[rutaSeleccionada]) {
            rutasTemp[rutaSeleccionada].forEach(layer => drawnItems.addLayer(layer));
            const stops = drawnItems.getLayers().filter(l => l.feature?.geometry?.type === "Point");
            stopsSequence = stops.length > 0 ? Math.max(...stops.map(s => s.feature.properties.sequence)) + 1 : 0;
        } else {
            await cargarRuta(`../data/rutas/${carpeta}/routes.geojson`);
            await cargarRuta(`../data/rutas/${carpeta}/stops.geojson`);
        }
    }

    async function cargarRuta(archivo) {
        try {
            const res = await fetch(archivo);
            const data = await res.json();

            L.geoJSON(data, {
                onEachFeature: (feature, layer) => {
                    if (feature.geometry.type === "LineString") {
                        feature.properties.name = rutaSeleccionada;
                    }
                    drawnItems.addLayer(layer);
                }
            });

            const stops = drawnItems.getLayers().filter(l => l.feature?.geometry?.type === "Point");
            stopsSequence = stops.length > 0 ? Math.max(...stops.map(s => s.feature.properties.sequence)) + 1 : 0;

        } catch (err) {
            console.warn("No se pudo cargar:", archivo);
        }
    }

    // ==========================================================
    // ------------------- BOTONES DEL SIDEBAR ------------------
    // ==========================================================

    document.getElementById("nuevaRuta").addEventListener("click", () => {
        const nombre = prompt("Nombre de la nueva ruta (ej: 10004)");
        if (!nombre) return;
        if (rutas.includes(nombre)) return alert("Ya existe una ruta con ese nombre");
        rutas.push(nombre);
        rutaSeleccionada = nombre;
        stopsSequence = 0;
        drawnItems.clearLayers();
        mostrarListaRutas();
        guardarRutaTemporal();
    });

    document.getElementById("eliminarRuta").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");
        if (!confirm(`Se eliminara la ruta ${rutaSeleccionada}. ¿Continuar?`)) return;
        rutas = rutas.filter(r => r !== rutaSeleccionada);
        delete rutasTemp[rutaSeleccionada];
        rutaSeleccionada = null;
        stopsSequence = 0;
        drawnItems.clearLayers();
        mostrarListaRutas();
    });

    document.getElementById("downloadGeoJSON").addEventListener("click", () => {
        if (!rutaSeleccionada) return alert("Selecciona una ruta primero");

        const geojson = drawnItems.toGeoJSON();
        const paradas = geojson.features.filter(f => f.geometry.type === "Point");
        if (paradas.length === 0) return alert("No se puede descargar rutas sin paradas");

        const rutasGeoJSON = {
            type: "FeatureCollection",
            features: geojson.features.filter(f => f.geometry.type === "LineString")
        };
        const blobRutas = new Blob([JSON.stringify(rutasGeoJSON, null, 2)], { type: "application/json" });
        const aRutas = document.createElement("a");
        aRutas.href = URL.createObjectURL(blobRutas);
        aRutas.download = "routes.geojson";
        aRutas.click();

        const blobParadas = new Blob([JSON.stringify({ type: "FeatureCollection", features: paradas }, null, 2)], { type: "application/json" });
        const aParadas = document.createElement("a");
        aParadas.href = URL.createObjectURL(blobParadas);
        aParadas.download = "stops.geojson";
        aParadas.click();
    });

    // ==========================================================
    // ----------- IMPORTAR ARCHIVOS GEOJSON LOCALES ------------
    // ==========================================================

    const uploadBtn = document.getElementById("uploadGeoJSON");
    const inputGeoJSON = document.getElementById("inputGeoJSON");

    uploadBtn.addEventListener("click", () => {
        inputGeoJSON.click(); // Abre el explorador
    });

    inputGeoJSON.addEventListener("change", async (event) => {
        const archivos = event.target.files;
        if (archivos.length === 0) return;

        drawnItems.clearLayers();
        stopsSequence = 0;

        for (const archivo of archivos) {
            try {
                const contenido = await archivo.text();
                const data = JSON.parse(contenido);

                L.geoJSON(data, {
                    onEachFeature: (feature, layer) => {
                        if (feature.geometry.type === "LineString") {
                            feature.properties.name = rutaSeleccionada || "Ruta importada";
                        }
                        drawnItems.addLayer(layer);
                    }
                });

                console.log(`✅ Importado: ${archivo.name}`);
            } catch (err) {
                console.error(`❌ Error al importar ${archivo.name}:`, err);
            }
        }

        const stops = drawnItems.getLayers().filter(l => l.feature?.geometry?.type === "Point");
        stopsSequence = stops.length > 0 ? Math.max(...stops.map(s => s.feature.properties.sequence)) + 1 : 0;

        guardarRutaTemporal();
        alert("✅ Archivos importados correctamente.");
        inputGeoJSON.value = "";
    });

    // ==========================================================
    // ------------------ CARGA INICIAL -------------------------
    // ==========================================================

    cargarIndex();
});
