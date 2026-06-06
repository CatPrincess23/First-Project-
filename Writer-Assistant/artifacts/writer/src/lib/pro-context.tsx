import { useState, createContext, useContext } from "react";

type ProContextType = {
  isPro: boolean;
  requestsLeft: number;
  useRequest: () => boolean;
  showUpgradeModal: boolean;
  setShowUpgradeModal: (show: boolean) => void;
};

const PRO_EMAILS: string[] = [];

const ProContext = createContext<ProContextType | null>(null);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro] = useState(false);
  const [requestsLeft, setRequestsLeft] = useState(3);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const useRequest = () => {
    if (isPro) return true;
    if (requestsLeft > 0) {
      setRequestsLeft((prev) => prev - 1);
      return true;
    }
    setShowUpgradeModal(true);
    return false;
  };

  return (
    <ProContext.Provider value={{ isPro, requestsLeft, useRequest, showUpgradeModal, setShowUpgradeModal }}>
      {children}
    </ProContext.Provider>
  );
}

export const usePro = () => {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("usePro must be used within ProProvider");
  return ctx;
};
