import { useEffect as usarEfecto, useRef as usarReferencia, useState as usarEstado } from 'react';
import mapasLeaflet from 'leaflet';
import './MapaReportes.css';
import { ZONA_COBERTURA, CENTRO_MAPA, ESTADOS, puntoDentroZona } from '../shared/domain.js';
const colores = {
  [ESTADOS.PENDIENTE]: "#be8524",
  [ESTADOS.EN_PROCESO]: "#497dba",
  [ESTADOS.RESUELTO]: "#188366"
};
function MapaReportes({
  puntos = [],
  seleccionado: seleccionado,
  alSeleccionar: alSeleccionar,
  alAbrirReporte: alAbrirReporte,
  mostrarCalor = false,
  grupos = [],
  foco,
  ampliado = false
}) {
  const elementoMapa = usarReferencia(null),
    mapa = usarReferencia(null),
    marcadores = usarReferencia(null),
    seleccion = usarReferencia(null),
    capaCalor = usarReferencia(null);
  const gestorSeleccion = usarReferencia(alSeleccionar),
    gestorReporte = usarReferencia(alAbrirReporte);
  gestorSeleccion.current = alSeleccionar;
  gestorReporte.current = alAbrirReporte;
  const [errorCartografia, establecerErrorCartografia] = usarEstado(false),
    [errorSeleccion, establecerErrorSeleccion] = usarEstado("");
  usarEfecto(() => {
    const instancia = mapasLeaflet.map(elementoMapa.current, {
      zoomControl: false,
      scrollWheelZoom: false
    }).setView(CENTRO_MAPA, 15);
    mapa.current = instancia;
    instancia.createPane('concentraciones');
    instancia.getPane('concentraciones').style.zIndex = '390';
    mapasLeaflet.control.zoom({
      position: "bottomright"
    }).addTo(instancia);
    const teselas = mapasLeaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(instancia);
    teselas.on('tileerror', () => establecerErrorCartografia(true));
    const cobertura = mapasLeaflet.geoJSON(ZONA_COBERTURA, {
      attribution: 'Límites: <a href="https://scmgpc.iecm.mx/Cartografia_SCMGPC.php" target="_blank" rel="noreferrer">IECM</a>',
      style: unidad => ({
        color: unidad.properties.clave === '06-050' ? '#286b53' : '#386c9c',
        weight: 2,
        fillColor: unidad.properties.clave === '06-050' ? '#5f9b77' : '#6f9fc5',
        fillOpacity: 0.10
      }),
      onEachFeature: (unidad, capa) => capa.bindTooltip(`${unidad.properties.nombre} · ${unidad.properties.clave}`, {sticky: true})
    }).addTo(instancia);
    instancia.fitBounds(cobertura.getBounds(), {padding: [24, 24], maxZoom: 15});
    marcadores.current = mapasLeaflet.layerGroup().addTo(instancia);
    seleccion.current = mapasLeaflet.layerGroup().addTo(instancia);
    instancia.on('click', evento => {
      if (!gestorSeleccion.current) return;
      if (!puntoDentroZona(evento.latlng.lat, evento.latlng.lng)) {
        establecerErrorSeleccion("Elige un punto dentro de Granjas México I o II.");
        return;
      }
      establecerErrorSeleccion("");
      gestorSeleccion.current([evento.latlng.lat, evento.latlng.lng]);
    });
    const observador = new ResizeObserver(() => instancia.invalidateSize());
    observador.observe(elementoMapa.current);
    return () => {
      observador.disconnect();
      instancia.remove();
      mapa.current = null;
    };
  }, []);
  usarEfecto(() => {
    if (!mapa.current) return;
    marcadores.current.clearLayers();
    for (const punto of puntos) {
      const marcador = mapasLeaflet.circleMarker([punto.latitud, punto.longitud], {
        radius: 7,
        color: '#ffffff',
        weight: 2.5,
        fillColor: colores[punto.estado] || '#173f37',
        fillOpacity: 1
      }).addTo(marcadores.current);
      const etiqueta = document.createElement("div");
      etiqueta.textContent = `${punto.folio} · ${punto.tipo} · ${punto.calle}`;
      marcador.bindTooltip(etiqueta);
      marcador.on('click', () => gestorReporte.current?.(punto.id));
    }
    for (const grupo of grupos) {
      mapasLeaflet.circle([grupo.latitud, grupo.longitud], {
        pane: 'concentraciones',
        interactive: false,
        radius: Math.max(120, grupo.radio_visual_metros),
        color: '#b05b45',
        weight: 2,
        fillOpacity: .20
      }).addTo(marcadores.current);
      const etiqueta = document.createElement('span');
      etiqueta.textContent = `${grupo.cantidad} reportes por atender${grupo.nombre_zona ? ' · ' + grupo.nombre_zona : ''}`;
      const marcador = mapasLeaflet.marker([grupo.latitud, grupo.longitud], {
        icon: mapasLeaflet.divIcon({className: 'concentration-count', html: `<span>${Number(grupo.cantidad)}</span>`, iconSize: [34,34]}),
        title: etiqueta.textContent, alt: etiqueta.textContent
      }).addTo(marcadores.current).bindTooltip(etiqueta);
      marcador.getElement()?.setAttribute('aria-label', etiqueta.textContent);
      marcador.on('click', () => mapa.current.fitBounds(mapasLeaflet.latLng(grupo.latitud, grupo.longitud).toBounds(grupo.radio_visual_metros * 2 + 100), {padding: [30,30], maxZoom: 17}));
    }
  }, [puntos, grupos]);
  usarEfecto(() => {
    if (!mapa.current) return;
    if (!foco) {
      const [oeste, sur, este, norte] = ZONA_COBERTURA.bbox;
      mapa.current.fitBounds([[sur, oeste], [norte, este]], {padding: [24,24], maxZoom: 15});
      return;
    }
    if (!Number.isFinite(foco.latitud) || !Number.isFinite(foco.longitud)) return;
    mapa.current.fitBounds(mapasLeaflet.latLng(foco.latitud, foco.longitud).toBounds((foco.radio_visual_metros || 150) * 2 + 100), {padding: [30,30], maxZoom: 17});
  }, [foco]);
  usarEfecto(() => {
    seleccion.current?.clearLayers();
    if (seleccionado && puntoDentroZona(...seleccionado)) establecerErrorSeleccion("");
    if (seleccionado && seleccionado.every(Number.isFinite)) mapasLeaflet.circleMarker(seleccionado, {
      radius: 10,
      color: '#fff',
      weight: 3,
      fillColor: '#173f37',
      fillOpacity: 1
    }).addTo(seleccion.current);
  }, [seleccionado]);
  usarEfecto(() => {
    let cancelado = false;
    if (capaCalor.current) {
      capaCalor.current.remove();
      capaCalor.current = null;
    }
    const puntosPorAtender = puntos.filter(punto => [ESTADOS.PENDIENTE, ESTADOS.EN_PROCESO].includes(punto.estado));
    if (mostrarCalor && puntosPorAtender.length) {
      window.L = mapasLeaflet;
      import("leaflet.heat").then(() => {
        if (cancelado || !mapa.current) return;
        capaCalor.current = mapasLeaflet.heatLayer(puntosPorAtender.map(elemento => [elemento.latitud, elemento.longitud, .7]), {
          radius: 35,
          blur: 26,
          minOpacity: .35,
          gradient: {
            .3: '#6cb49c',
            .6: '#edbd64',
            1: '#bc5948'
          }
        }).addTo(mapa.current);
      }).catch(() => establecerErrorSeleccion("No se pudo cargar la capa de calor. Los puntos siguen disponibles."));
    }
    return () => {
      cancelado = true;
      if (capaCalor.current) {
        capaCalor.current.remove();
        capaCalor.current = null;
      }
    };
  }, [mostrarCalor, puntos]);
  return <><div className={`map-shell ${ampliado ? 'large' : ''} ${alSeleccionar ? 'selectable' : ''}`}>
    <div ref={elementoMapa} className="leaflet-map" aria-label={alSeleccionar ? "Mapa para seleccionar la ubicación. También puedes usar los campos de coordenadas." : "Mapa de reportes activos en Granjas México"} />
    {(errorCartografia || errorSeleccion) && <div className="map-warning" role="status">{errorSeleccion || "No se pudo cargar parte del mapa. Revisa tu conexión; puedes capturar las coordenadas debajo."}</div>}
  </div><div className="coverage-legend" aria-label="Zona de cobertura"><span><i className="coverage-swatch first" />Granjas México I</span><span><i className="coverage-swatch second" />Granjas México II</span></div></>;
}
export { MapaReportes as default };
