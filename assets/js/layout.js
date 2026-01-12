"use strict";

window.LayoutModule = {
  injectLayout: function (activePage) {
    this.injectSidebar(activePage);
    this.injectHeader();
  },

    injectSidebar: function (activePage) {
    const sidebar = document.getElementById("sidebar-container");
    if (!sidebar) return;

    // Get Current User Role (set by AuthModule)
    const currentUser = window.currentUser || {};
    const profile = currentUser.profile || {};
    const role = (profile.role || '').toLowerCase();

    const isLogisticaActive =
      activePage === "logistica" ||
      activePage === "logistica-stock" ||
      activePage === "logistica-personal";
    const isMasterActive = activePage && activePage.startsWith("master");

    const isHerramientasActive =
      activePage && activePage.startsWith("herramientas");
    const isAdminActive = activePage && activePage.startsWith("admin");
    const isStaffActive = activePage && activePage.startsWith("staff");

    // Path helper: determines if we need to go up or down levels
    const getPath = (target) => {
      // Map of targets to their paths from root
      const paths = {
        index: "index.html",
        "staff-convocatorias": "pages/staff/staff-convocatorias.html",
        "encargados-barra": "pages/encargados/encargado-barra.html",
        "encargados-caja": "pages/encargados/encargado-caja.html",
        "encargados-seguridad": "pages/encargados/encargado-seguridad.html",
        "encargados-limpieza": "pages/encargados/encargado-limpieza.html",
        "encargados-produccion": "pages/encargados/encargado-produccion.html",
        "logistica-stock": "pages/logistica/logistica-stock.html",
        "logistica-personal": "pages/logistica/logistica-personal.html",

        "master-proveedores": "pages/master/master-proveedores.html",
        "master-usuarios": "pages/master/master-usuarios.html",
        "master-skus": "pages/master/master-skus.html",
        "master-pagos": "pages/master/master-pagos.html",
        "master-tarifario": "pages/master/master-tarifario.html",

        "herramientas-analisis": "pages/herramientas/herramientas-analisis.html",
        "herramientas-qr": "pages/herramientas/herramientas-qr.html",
        
        "admin-stock": "pages/admin/admin-stock.html",
        "admin-pagos": "pages/admin/admin-pagos.html",
        "admin-solicitudes": "pages/admin/admin-solicitudes.html",

        "contabilidad-calendario": "pages/contabilidad/calendario-pagos.html",
        "gerencia-balance": "pages/gerencia/balance-semanal.html",
        "operativo-stock": "pages/operativo/operativo-stock.html",
      };

      const isRoot = activePage === "general";
      if (isRoot) return paths[target];

      // If we are in pages/folder/, we need ../../ to get to root, then down to target
      return "../../" + paths[target];
    };

    // --- MENU BUILDING ---
    let menuItems = '';

    // 1. INICIO (Everyone?) -> Actually Encargados have their own "Home". 
    // If admin, show Index.
    if (role === 'admin') {
        menuItems += `
            <li>
                <a href="${getPath("index")}" class="${activePage === "general" ? "active" : ""}">
                    Inicio
                </a>
            </li>
        `;
    }

    // 2. STAFF (Role: staff usually doesn't see this sidebar, but 'staff' user might?)
    // If we have 'staff' role accessing this, show Staff links.
    if (role === 'staff barra' || role === 'admin') {
         menuItems += `
             <li>
                <a href="${getPath("staff-convocatorias")}" class="${isStaffActive ? "active" : ""}">
                    Staff
                </a>
            </li>
         `;
    }

    // 3. ENCARGADOS
    // Admin sees ALL. Encargado sees ONLY their area.
    if (role === 'admin') {
        menuItems += `
            <li>
                <a href="#" id="btn-encargados" class="${
                    activePage && activePage.startsWith("encargados") ? "active" : ""
                }" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-encargados')">
                    Encargados
                </a>
                <ul id="submenu-encargados" class="sidebar-submenu ${
                    activePage && activePage.startsWith("encargados") ? "active" : ""
                }">
                    <li><a href="${getPath("encargados-barra")}" class="${activePage === "encargados-barra" ? "active" : ""}">Encargado Barra</a></li>
                    <li><a href="${getPath("encargados-caja")}" class="${activePage === "encargados-caja" ? "active" : ""}">Encargado Caja</a></li>
                    <li><a href="${getPath("encargados-seguridad")}" class="${activePage === "encargados-seguridad" ? "active" : ""}">Encargado Seguridad</a></li>
                    <li><a href="${getPath("encargados-limpieza")}" class="${activePage === "encargados-limpieza" ? "active" : ""}">Encargado Limpieza</a></li>
                    <li><a href="${getPath("encargados-produccion")}" class="${activePage === "encargados-produccion" ? "active" : ""}">Encargado Produccion</a></li>
                </ul>
            </li>
        `;
    } else if (role === 'encargado barra') {
        menuItems += `
            <li>
                <a href="${getPath("encargados-barra")}" class="${activePage === "encargados-barra" ? "active" : ""}">
                    Mi Panel (Barra)
                </a>
            </li>
        `;
    }

    // 4. LOGISTICA (Admin Only for now, or Logistica role?)
    if (role === 'admin' || role === 'logistica') {
        menuItems += `
            <li>
                <a href="#" id="btn-logistica" class="${isLogisticaActive ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-logistica')">
                    Logística
                </a>
                <ul id="submenu-logistica" class="sidebar-submenu ${isLogisticaActive ? "active" : ""}">
                    <li><a href="${getPath("logistica-stock")}" class="${activePage === "logistica-stock" ? "active" : ""}">Gestión de Stock</a></li>
                    <li><a href="${getPath("logistica-personal")}" class="${activePage === "logistica-personal" ? "active" : ""}">Personal</a></li>
                </ul>
            </li>
        `;
    }

    // 5. OPERATIVO
    if (role === 'admin' || role === 'operativo') {
         menuItems += `
            <li>
                <a href="#" id="btn-operativo" class="${activePage === "operativo-stock" ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-operativo')">
                    Operativo
                </a>
                 <ul id="submenu-operativo" class="sidebar-submenu ${activePage === "operativo-stock" ? "active" : ""}">
                    <li><a href="${getPath("operativo-stock")}" class="${activePage === "operativo-stock" ? "active" : ""}">Stock Operativo</a></li>
                </ul>
            </li>
         `;
    }

    // 6. ADMINISTRACION
    // 7. CONTABILIDAD
    // 8. GERENCIA
    // 9. MASTER
    // 10. HERRAMIENTAS
    // For brevity, assuming only Admin sees these. Or specific roles.
    if (role === 'admin') {
        menuItems += `
            <li>
                <a href="#" id="btn-admin" class="${isAdminActive ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-admin')">
                    Administración
                </a>
                <ul id="submenu-admin" class="sidebar-submenu ${isAdminActive ? "active" : ""}">
                    <li><a href="${getPath("admin-stock")}" class="${activePage === "admin-stock" ? "active" : ""}">Gestión de Stock</a></li>
                    <li><a href="${getPath("admin-pagos")}" class="${activePage === "admin-pagos" ? "active" : ""}">Cuentas por Pagar</a></li>
                    <li><a href="${getPath("admin-solicitudes")}" class="${activePage === "admin-solicitudes" ? "active" : ""}">Gestión de Solicitudes</a></li>
                </ul>
            </li>
            
            <li>
                <a href="#" id="btn-contabilidad" class="${activePage && activePage.startsWith("contabilidad") ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-contabilidad')">
                    Contabilidad
                </a>
                <ul id="submenu-contabilidad" class="sidebar-submenu ${activePage && activePage.startsWith("contabilidad") ? "active" : ""}">
                    <li><a href="${getPath("contabilidad-calendario")}" class="${activePage === "contabilidad-calendario" ? "active" : ""}">Calendario</a></li>
                </ul>
            </li>

            <li>
                 <a href="#" id="btn-gerencia" class="${activePage && activePage.startsWith("gerencia") ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-gerencia')">
                    Gerencia
                </a>
                <ul id="submenu-gerencia" class="sidebar-submenu ${activePage && activePage.startsWith("gerencia") ? "active" : ""}">
                    <li><a href="${getPath("gerencia-balance")}" class="${activePage === "gerencia-balance" ? "active" : ""}">Balance</a></li>
                </ul>
            </li>

            <li>
                <a href="#" id="btn-master" class="${isMasterActive ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-master')">
                    Master-data
                </a>
                 <ul id="submenu-master" class="sidebar-submenu ${isMasterActive ? "active" : ""}">
                    <li><a href="${getPath("master-usuarios")}" class="${activePage === "master-usuarios" ? "active" : ""}">Usuarios</a></li>
                    <li><a href="${getPath("master-proveedores")}" class="${activePage === "master-proveedores" ? "active" : ""}">Proveedores</a></li>
                    <li><a href="${getPath("master-skus")}" class="${activePage === "master-skus" ? "active" : ""}">Sku´s</a></li>
                    <li><a href="${getPath("master-pagos")}" class="${activePage === "master-pagos" ? "active" : ""}">Tipos de Pago</a></li>
                    <li><a href="${getPath("master-tarifario")}" class="${activePage === "master-tarifario" ? "active" : ""}">Tarifario</a></li>           
                </ul>
            </li>

            <li>
                <a href="#" id="btn-herramientas" class="${isHerramientasActive ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-herramientas')">
                    Herramientas
                </a>
                <ul id="submenu-herramientas" class="sidebar-submenu ${isHerramientasActive ? "active" : ""}">
                    <li><a href="${getPath("herramientas-analisis")}" class="${activePage === "herramientas-analisis" ? "active" : ""}">Analisis de Consumo</a></li>
                    <li><a href="${getPath("herramientas-qr")}" class="${activePage === "herramientas-qr" ? "active" : ""}">Imprimir QRs</a></li>
                </ul>
            </li>
        `;
    }

    if (role === 'gerencia') {
        menuItems += `
            <li>
                 <a href="#" id="btn-gerencia" class="${activePage && activePage.startsWith("gerencia") ? "active" : ""}" onclick="window.LayoutModule.toggleSubmenu(event, 'submenu-gerencia')">
                    Gerencia
                </a>
                <ul id="submenu-gerencia" class="sidebar-submenu ${activePage && activePage.startsWith("gerencia") ? "active" : ""}">
                    <li><a href="${getPath("gerencia-balance")}" class="${activePage === "gerencia-balance" ? "active" : ""}">Balance</a></li>
                </ul>
            </li>
        `;
    }

    sidebar.innerHTML = `
            <div class="sidebar-container">
                <h3 class="sidebar-title">MIDNIGHT CLUB</h3>
                
                <div class="sidebar-nav">
                    <ul>
                        ${menuItems}
                    </ul>
                </div>
                
                <div class="sidebar-footer">
                    <div id="user-info" class="sidebar-user-info">
                        <p class="sidebar-user-name">Cargando...</p>
                    </div>
                    <button id="logoutBtn" class="sidebar-logout-btn">
                        Cerrar Sesión
                    </button>
                    <p class="sidebar-version">v1.0.0</p>
                </div>
            </div>
        `;
    
    // Trigger Auth UI Update now that DOM exists
    if (window.AuthModule && typeof window.AuthModule.updateUI === 'function') {
        window.AuthModule.updateUI();
    }
  },

  toggleSubmenu: function (event, id) {
    event.preventDefault();
    const submenu = document.getElementById(id);
    if (submenu) {
      const isActive = submenu.classList.contains("active");
      // Close other submenus if needed (optional)
      submenu.classList.toggle("active");
    }
  },

  injectHeader: function () {
    const header = document.getElementById("header-container");
    if (!header) return;
    // Header left empty as requested
    header.innerHTML = "";
  },
};
