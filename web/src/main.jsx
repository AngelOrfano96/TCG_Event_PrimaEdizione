import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Admin from "./Admin.jsx";

function Root() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash.startsWith("#/admin") ? <Admin /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);

