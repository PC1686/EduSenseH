// [HACKATHON TIMELINE] STEP 3 (Hour 4) - Auth State Management Logic
import React, { useEffect } from "react";
import { createContext, useCallback, useContext, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);


    const loadProfile = async (user) => {
        if (!user) {
            setUserData(null);
            return;
        }

        try {
            // 1. Try to fetch existing profile
            let { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            // 2. If no profile exists (or error), create one using metadata
            if (!data) {
                const newProfile = {
                    id: user.id,
                    email: user.email,
                    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                    role: user.user_metadata?.role || 'student'
                };

                const { data: createdProfile, error: createError } = await supabase
                    .from('profiles')
                    .insert(newProfile)
                    .select()
                    .single();

                if (!createError) data = createdProfile;
            }

            // 3. Set state (use fallback if everything fails)
            setUserData(data || {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || '',
                role: user.user_metadata?.role || 'student',
            });

        } catch (err) {
            console.error("Auth Load Error:", err);
            setUserData({
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || '',
                role: user.user_metadata?.role || 'student',
            });
        }
    };

    const register = useCallback(async (email, password, name, role = 'student') => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    role: role
                }
            }
        });

        if (error) {
            throw error;
        }

        // Profile rows should be created server-side (trigger) to avoid RLS failures
        // when signUp requires email confirmation (no authenticated session yet).
        return data;
    }, []);

    const login = useCallback(async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        // Profile will be loaded by onAuthStateChange listener
        return data;
    }, []);

    const logout = useCallback(async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error('Error during signOut:', e);
        }
        setCurrentUser(null);
        setUserData(null);
    }, []);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setCurrentUser(session?.user ?? null);
            if (session?.user) {
                await loadProfile(session.user);
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = useMemo(() => ({
        currentUser,
        userData,
        register,
        login,
        logout,
        loading,
    }), [currentUser, userData, register, login, logout, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

};