"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from "react";

export type Business = {
  id: number;
  name: string;
};

type State = {
  businesses: Business[];
  selectedBusiness: Business | null;
  isLoading: boolean;
};

type Action =
  | { type: "SET_BUSINESSES"; payload: Business[] }
  | { type: "SELECT_BUSINESS"; payload: Business }
  | { type: "CLEAR_SELECTION" }
  | { type: "SET_LOADING"; payload: boolean };

const initialState: State = {
  businesses: [],
  selectedBusiness: null,
  isLoading: true,
};

function businessReducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_BUSINESSES":
      return {
        ...state,
        businesses: action.payload,
        isLoading: false,
        // Auto-select the first business as a baseline default if none selected
        selectedBusiness: state.selectedBusiness || action.payload[0] || null,
      };
    case "SELECT_BUSINESS":
      return { ...state, selectedBusiness: action.payload };
    case "CLEAR_SELECTION":
      return { ...state, selectedBusiness: null };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

type BusinessContextType = {
  businesses: Business[];
  selectedBusiness: Business | null;
  isLoading: boolean;
  selectBusiness: (business: Business) => void;
  clearSelection: () => void;
  refreshBusinesses: () => Promise<void>;
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(businessReducer, initialState);

  const refreshBusinesses = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      // Replace with your proxy domain setup if running outside localhost
      const res = await fetch("http://localhost:8000/me/businesses", {
        headers: { "Content-Type": "application/json" },
        // If cookies/session auth is handling get_current_user:
        credentials: "include", 
      });
      const data = await res.json();
      if (data.businesses) {
        dispatch({ type: "SET_BUSINESSES", payload: data.businesses });
      }
    } catch (err) {
      console.error("Failed to sync client accounts:", err);
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  useEffect(() => {
    refreshBusinesses();
  }, []);

  const selectBusiness = (business: Business) => {
    dispatch({ type: "SELECT_BUSINESS", payload: business });
  };

  const clearSelection = () => {
    dispatch({ type: "CLEAR_SELECTION" });
  };

  return (
    <BusinessContext.Provider
      value={{
        businesses: state.businesses,
        selectedBusiness: state.selectedBusiness,
        isLoading: state.isLoading,
        selectBusiness,
        clearSelection,
        refreshBusinesses,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used within BusinessProvider");
  }
  return context;
}