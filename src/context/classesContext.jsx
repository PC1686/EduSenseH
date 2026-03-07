import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ClassesContext = createContext();

export const useClasses = () => {
  const context = useContext(ClassesContext);
  if (!context) {
    throw new Error('useClasses must be used within a ClassesProvider');
  }
  return context;
};

export const ClassesProvider = ({ children }) => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchClasses = useCallback(async (userId) => {
    if (!userId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      setClasses(data || []);
    } catch (err) {
      console.error('Error fetching classes:', err);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    classes,
    loading,
    fetchClasses,
  }), [classes, loading, fetchClasses]);

  return (
    <ClassesContext.Provider value={value}>
      {children}
    </ClassesContext.Provider>
  );
};
