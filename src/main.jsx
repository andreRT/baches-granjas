import bibliotecaReact from 'react';
import { createRoot as crearRaiz } from 'react-dom/client';
import Aplicacion from './App.jsx';
import './styles.css';
import 'leaflet/dist/leaflet.css';
class LimiteErrores extends bibliotecaReact.Component {
  state = {
    fallo: false
  };
  static getDerivedStateFromError() {
    return {
      fallo: true
    };
  }
  render() {
    return this.state.fallo ? <main className="fatal"><h1>No pudimos mostrar la página</h1><p>Recarga la aplicación para volver a intentarlo.</p><button onClick={() => location.reload()}>Recargar</button></main> : this.props.children;
  }
}
crearRaiz(document.getElementById("raiz")).render(<LimiteErrores><Aplicacion /></LimiteErrores>);
