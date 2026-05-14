"use client";

import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0f766e",
      light: "#ccfbf1",
      dark: "#0f4f48",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#2563eb",
      dark: "#1d4ed8",
      contrastText: "#ffffff",
    },
    background: {
      default: "#f7f4ed",
      paper: "#ffffff",
    },
    text: {
      primary: "#17202c",
      secondary: "#5b6676",
    },
    divider: "#e2ddd2",
    success: {
      main: "#16803c",
      light: "#dcfce7",
    },
    warning: {
      main: "#b76a00",
      light: "#fef3c7",
    },
    error: {
      main: "#b42318",
      light: "#fee2e2",
    },
    info: {
      main: "#2563eb",
      light: "#dbeafe",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "var(--font-inter), Inter, Arial, sans-serif",
    h1: {
      fontSize: "2.125rem",
      lineHeight: 1.12,
      fontWeight: 800,
      letterSpacing: 0,
    },
    h2: {
      fontSize: "1.375rem",
      lineHeight: 1.25,
      fontWeight: 800,
      letterSpacing: 0,
    },
    h3: {
      fontSize: "1.125rem",
      lineHeight: 1.35,
      fontWeight: 700,
      letterSpacing: 0,
    },
    body1: {
      lineHeight: 1.55,
    },
    body2: {
      lineHeight: 1.45,
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          minHeight: 38,
          paddingLeft: 14,
          paddingRight: 14,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #e2ddd2",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 50px rgba(15, 23, 42, 0.055)",
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 20,
          "&:last-child": {
            paddingBottom: 20,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 650,
          maxWidth: "100%",
        },
        label: {
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
    MuiTable: {
      defaultProps: {
        size: "small",
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: "#e5ebf1",
          paddingBottom: 12,
          paddingTop: 12,
          verticalAlign: "top",
        },
        head: {
          backgroundColor: "#faf8f1",
          color: "#536173",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0,
          textTransform: "uppercase",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});
