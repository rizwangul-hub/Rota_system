import React, { createContext, useContext, useState, useEffect } from 'react';

const LayoutContext = createContext();

export function LayoutProvider({ children }) {
  const [hideNavbar, setHideNavbar] = useState(() => {
    try {
      return localStorage.getItem('pixx_hide_navbar') === 'true';
    } catch {
      return false;
    }
  });

  const [hideSidebar, setHideSidebar] = useState(() => {
    try {
      return localStorage.getItem('pixx_hide_sidebar') === 'true';
    } catch {
      return false;
    }
  });

  const toggleNavbar = () => {
    setHideNavbar(prev => {
      const next = !prev;
      try {
        localStorage.setItem('pixx_hide_navbar', String(next));
      } catch {}
      return next;
    });
  };

  const toggleSidebar = () => {
    setHideSidebar(prev => {
      const next = !prev;
      try {
        localStorage.setItem('pixx_hide_sidebar', String(next));
      } catch {}
      return next;
    });
  };

  return (
    <LayoutContext.Provider value={{
      hideNavbar,
      setHideNavbar,
      toggleNavbar,
      hideSidebar,
      setHideSidebar,
      toggleSidebar
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    return {
      hideNavbar: false,
      setHideNavbar: () => {},
      toggleNavbar: () => {},
      hideSidebar: false,
      setHideSidebar: () => {},
      toggleSidebar: () => {}
    };
  }
  return context;
}
