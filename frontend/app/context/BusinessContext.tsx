"use client";

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
} from "react";

export type Business = {
  id: number;
  name: string;
};

type State = {
  selectedBusiness: Business | null;
};

type Action =
  | {
      type: "SELECT_BUSINESS";
      payload: Business;
    }
  | {
      type: "CLEAR_SELECTION";
    };

const initialState: State = {
  selectedBusiness: null,
};

function businessReducer(
  state: State,
  action: Action
): State {
  switch (action.type) {
    case "SELECT_BUSINESS":
      return {
        ...state,
        selectedBusiness: action.payload,
      };

    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedBusiness: null,
      };

    default:
      return state;
  }
}                                 

type BusinessContextType = {
  selectedBusiness: Business | null;
  selectBusiness: (business: Business) => void;
  clearSelection: () => void;
};

const BusinessContext = createContext<
  BusinessContextType | undefined
>(undefined);

export function BusinessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    businessReducer,
    initialState
  );

  const selectBusiness = (business: Business) => {
    dispatch({
      type: "SELECT_BUSINESS",
      payload: business,
    });
  };

  const clearSelection = () => {
    dispatch({
      type: "CLEAR_SELECTION",
    });
  };

  return (
    <BusinessContext.Provider
      value={{
        selectedBusiness: state.selectedBusiness,
        selectBusiness,
        clearSelection,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);

  if (!context) {
    throw new Error(
      "useBusiness must be used within BusinessProvider"
    );
  }

  return context;
}