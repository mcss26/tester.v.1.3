'use strict';

window.AuthModule = {
    init: async function() {
        console.log('AuthModule initialized');
        const sb = window.sb;
        if (!sb) {
            console.error('Supabase not initialized');
            return;
        }

        const { data: { session }, error } = await sb.auth.getSession();

        if (!session) {
            if (!window.location.pathname.includes('login.html')) {
                this.redirectToLogin();
            }
        } else {
            // Fetch Profile
            const { data: profile, error: profileError } = await sb.from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (profileError || !profile) {
                await sb.auth.signOut();
                this.redirectToLogin();
                return;
            }

            if (profile && profile.is_active === false) {
                await sb.auth.signOut();
                this.redirectToLogin();
                return;
            }

            // Store global user info
            window.currentUser = {
                ...session.user,
                profile
            };

            // Redirect Logic (Logic only, no DOM)
            this.handleRoleRedirect(profile);
            this.guardRoute(profile);
        }
    },

    updateUI: function() {
        const currentUser = window.currentUser;
        if (!currentUser) return;

        const profile = currentUser.profile;
        const userInfo = document.getElementById('user-info');
        
        if (userInfo) {
            const name = profile?.full_name || currentUser.email.split('@')[0];
            const email = currentUser.email;
            const roleLabel = profile?.role ? ` <span class="badge-xs">${profile.role}</span>` : '';
            
            userInfo.innerHTML = `
                <p class="sidebar-user-name">${name}${roleLabel}</p>
                <p class="sidebar-user-email">${email}</p>
            `;
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            // Remove old listener if any (to avoid duplicates if called multiple times)? 
            // cloneNode is a cheap way to strip listeners, or just ensure this is called once.
            // Simplified: just add listener.
            logoutBtn.onclick = async () => {
                const sb = window.sb;
                await sb.auth.signOut();
                window.location.href = window.location.pathname.includes('/pages/') ? '../../login.html' : 'login.html';
            };
        }
    },

    handleRoleRedirect: function(profile) {
        if (!profile) return false;
        const role = (profile.role || '').toLowerCase();

        // Determine current page
        const path = window.location.pathname;
        const isIndex = path.endsWith('index.html') || path.endsWith('/');
        const isLogin = path.endsWith('login.html');

        if (!isIndex && !isLogin) return false;

        const roleRoutes = this.getRoleRoutes();

        const target = roleRoutes[role];
        console.log(`AuthModule: Role '${role}' maps to '${target}'`);

        if (target) {
            const resolvedTarget = this.resolvePath(target);
            // Prevent infinite redirect loop if already on target
            // We check against the resolved target (relative) and current path
            // Simple check: if path ends with the target file/folder
            if (path.endsWith(target) || (target === 'index.html' && path.endsWith('/'))) {
                console.log('AuthModule: Already on target page. No redirect.');
                return true;
            }
            
            console.log(`AuthModule: Redirecting to '${resolvedTarget}'`);
            window.location.replace(resolvedTarget);
            return true;
        }

        return false;
    },

    getRoleRoutes: function() {
        return {
            admin: 'index.html',
            gerencia: 'pages/gerencia/gerencia-index.html',
            logistica: 'pages/logistica/logistica-index.html',
            operativo: 'pages/operativo/operativo-index.html',
            'encargado barra': 'pages/encargados/encargado-barra.html',
            'staff barra': 'pages/staff/staff-convocatorias.html'
        };
    },

    resolvePath: function(target) {
        if (!target) return '';
        const isNested = window.location.pathname.includes('/pages/');
        return isNested ? `../../${target}` : target;
    },

    redirectToLogin: function() {
        window.location.href = window.location.pathname.includes('/pages/') ? '../../login.html' : 'login.html';
    },

    redirectToRoleHome: function(profile) {
        if (!profile) return;
        const role = (profile.role || '').toLowerCase();
        const target = this.getRoleRoutes()[role];
        if (target) {
            window.location.href = this.resolvePath(target);
        } else {
            this.redirectToLogin();
        }
    },

    guardRoute: function(profile) {
        const role = (profile?.role || '').toLowerCase();
        const path = window.location.pathname;

        const isIndex = path.endsWith('index.html') || path.endsWith('/');
        const isLogin = path.endsWith('login.html');
        if (isIndex || isLogin) return;

        if (!role) {
            this.redirectToLogin();
            return;
        }

        if (role === 'admin') return;

        const rules = [
            { match: /\/pages\/master\//, roles: ['admin'] },
            { match: /\/pages\/admin\//, roles: ['admin'] },
            { match: /\/pages\/contabilidad\//, roles: ['admin'] },
            { match: /\/pages\/herramientas\//, roles: ['admin'] },
            { match: /\/pages\/gerencia\//, roles: ['gerencia'] },
            { match: /\/pages\/logistica\//, roles: ['logistica'] },
            { match: /\/pages\/operativo\//, roles: ['operativo'] },
            { match: /\/pages\/encargados\/encargado-barra\.html$/, roles: ['encargado barra'] },
            { match: /\/pages\/encargados\//, roles: ['admin'] },
            { match: /\/pages\/staff\//, roles: ['staff barra'] }
        ];

        const rule = rules.find((entry) => entry.match.test(path));
        if (!rule) return;

        if (!rule.roles.includes(role)) {
            this.redirectToRoleHome(profile);
        }
    }
};
