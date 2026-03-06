// [HACKATHON TIMELINE] STEP 9 (Hour 20) - Real-time Peer-to-Peer Chat
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';


const Chat = () => {
    const { groupId } = useParams();
    const { userData } = useAuth();
    const [group, setGroup] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [messageSending, setMessageSending] = useState(false);
    const [chatFile, setChatFile] = useState(null);
    const [chatFilePreview, setChatFilePreview] = useState(null);
    const [realtimeEnabled, setRealtimeEnabled] = useState(true);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [typingUsers, setTypingUsers] = useState([]);
    const channelRef = useRef(null);
    const typingTimeoutRef = useRef({});


    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const pollingIntervalRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchGroup = useCallback(async () => {
        try {
            const { data: groupData, error } = await supabase
                .from('groups')
                .select('*')
                .eq('id', groupId)
                .single();

            if (error || !groupData) {
                console.error("Group not found");
                return;
            }
            setGroup(groupData);
        } catch (error) {
            console.error('Error fetching group:', error);
        }
    }, [groupId]);

    const subscribeMessages = useCallback(() => {
        const loadInitial = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('group_id', groupId)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setMessages(data);
            }
        };

        loadInitial();

        // Create channel with broadcast for instant message delivery
        const channel = supabase
            .channel(`chat:${groupId}`, {
                config: {
                    broadcast: { self: false },
                    presence: { key: userData?.id },
                },
            })
            // Broadcast events for instant message propagation
            .on('broadcast', { event: 'new_message' }, (payload) => {
                const message = payload.payload;
                setMessages((prev) => {
                    if (prev.some(msg => msg.id === message.id)) return prev;
                    return [...prev, message];
                });
                scrollToBottom();
            })
            .on('broadcast', { event: 'user_typing' }, (payload) => {
                const { userId, userName, isTyping } = payload.payload;
                setTypingUsers((prev) => {
                    const filtered = prev.filter(u => u.id !== userId);
                    if (isTyping) {
                        return [...filtered, { id: userId, name: userName }];
                    }
                    return filtered;
                });
            })
            // Postgres changes as backup
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `group_id=eq.${groupId}`
                },
                (payload) => {
                    setMessages((prev) => {
                        if (prev.some(msg => msg.id === payload.new.id)) return prev;
                        return [...prev, payload.new];
                    });
                    scrollToBottom();
                },
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'messages',
                    filter: `group_id=eq.${groupId}`
                },
                (payload) => {
                    setMessages((prev) => prev.filter(msg => msg.id !== payload.old.id));
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setRealtimeEnabled(true);
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    setRealtimeEnabled(false);
                    if (!pollingIntervalRef.current) {
                        pollingIntervalRef.current = setInterval(loadInitial, 5000);
                    }
                }
            });

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [groupId, userData?.id]);

    useEffect(() => {
        let cleanupMessages;
        const intervalOnSetup = pollingIntervalRef.current;

        if (userData && groupId) {
            fetchGroup();
            cleanupMessages = subscribeMessages();
        }

        return () => {
            if (cleanupMessages) cleanupMessages();
            if (intervalOnSetup) {
                clearInterval(intervalOnSetup);
            }
        };
    }, [groupId, userData, fetchGroup, subscribeMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleChatFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setChatFile(file);

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => setChatFilePreview(e.target.result);
            reader.readAsDataURL(file);
        } else {
            setChatFilePreview(null);
        }
    };

    const clearChatFile = () => {
        setChatFile(null);
        setChatFilePreview(null);
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !chatFile) return;
        if (messageSending) return;

        const messageText = newMessage.trim();
        const tempId = `temp-${Date.now()}`;

        // Optimistic UI update - show message immediately
        const optimisticMessage = {
            id: tempId,
            group_id: groupId,
            user_id: userData.id,
            user_name: userData.name || userData.email || 'You',
            text: messageText,
            file_url: chatFilePreview || null,
            file_name: chatFile ? chatFile.name : null,
            file_type: chatFile ? chatFile.type : null,
            created_at: new Date().toISOString(),
            _isOptimistic: true, // Flag to identify optimistic messages
        };

        // Add to messages immediately (this makes it show right away)
        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');

        // Force scroll after state update
        setTimeout(() => scrollToBottom(), 10);

        // Broadcast message to other clients immediately for faster delivery
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'new_message',
                payload: optimisticMessage,
            }).catch(err => console.log('Broadcast error (non-critical):', err));
        }

        let fileUrl = null;
        let fileName = null;
        let fileType = null;

        if (chatFile) {
            try {
                const path = `${groupId}/chat/${Date.now()}-${chatFile.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('chat-files')
                    .upload(path, chatFile);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('chat-files')
                    .getPublicUrl(path);

                fileUrl = publicUrlData?.publicUrl || '';
                fileName = chatFile.name;
                fileType = chatFile.type;
            } catch (error) {
                console.error('Error uploading chat file:', error);
                alert('Failed to upload file: ' + error.message);
                setMessages(prev => prev.filter(msg => msg.id !== tempId));
                setNewMessage(messageText);
                return;
            }
        }

        try {
            setMessageSending(true);
            const { data, error } = await supabase.from('messages').insert({
                group_id: groupId,
                user_id: userData.id,
                user_name: userData.name || userData.email,
                text: messageText,
                file_url: fileUrl,
                file_name: fileName,
                file_type: fileType,
            }).select().single();

            if (error) throw error;

            // Update optimistic message with confirmed data
            if (data) {
                setMessages(prev => prev.map(msg => msg.id === tempId ? { ...data, _isOptimistic: false } : msg));

                // Also broadcast to other clients if channel is available
                if (channelRef.current) {
                    channelRef.current.send({
                        type: 'broadcast',
                        event: 'new_message',
                        payload: data,
                    }).catch(err => console.log('Broadcast error (non-critical):', err));
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Mark message as failed instead of removing it
            setMessages(prev => prev.map(msg =>
                msg.id === tempId
                    ? { ...msg, _isFailed: true, _error: error.message }
                    : msg
            ));
            // Don't restore the input text - user can see the failed message and retry
        } finally {
            setMessageSending(false);
            clearChatFile();
        }
    };

    const deleteMessage = async (messageId) => {
        const message = messages.find(msg => msg.id === messageId);
        if (!message) return;

        const canDelete = userData && (
            userData.id === message.user_id ||
            userData.role === 'teacher' ||
            group?.created_by === userData.id
        );

        if (!canDelete) {
            alert('You can only delete your own messages or you must be a teacher/group creator.');
            return;
        }

        const confirmDelete = window.confirm('Are you sure you want to delete this message?');
        if (!confirmDelete) return;

        try {
            const { error: dbError } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId);

            if (dbError) throw dbError;

            setMessages(prev => prev.filter(msg => msg.id !== messageId));
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete message.');
        }
    };

    // Typing indicator handlers
    const handleTyping = useCallback((isTyping) => {
        if (!channelRef.current || !userData) return;

        channelRef.current.send({
            type: 'broadcast',
            event: 'user_typing',
            payload: {
                userId: userData.id,
                userName: userData.name || userData.email,
                isTyping,
            },
        });
    }, [userData]);

    const onMessageChange = (e) => {
        setNewMessage(e.target.value);
        handleTyping(true);

        // Clear previous timeout for this user
        if (typingTimeoutRef.current[userData?.id]) {
            clearTimeout(typingTimeoutRef.current[userData?.id]);
        }

        // Set new timeout to stop typing indicator after 2 seconds
        typingTimeoutRef.current[userData?.id] = setTimeout(() => {
            handleTyping(false);
        }, 2000);
    };

    // Removed unused triggerAiTutor

    if (!groupId) {
        return <div className="p-8 text-center text-gray-400">Please select a group to chat.</div>;
    }

    return (
        <div className="flex h-[calc(100vh-80px)] bg-slate-100 p-4 gap-4">
            {/* Main Chat Area */}
            <div className="flex-1 bg-white rounded-2xl shadow-md flex flex-col overflow-hidden border border-gray-100 relative">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 m-0">
                            {group ? `${group.name} - Group Chat` : 'Group Chat'}
                        </h3>
                        <p className="text-xs text-gray-500 m-0">Collaborate with your peers</p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${realtimeEnabled ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                        <span className="text-xs text-gray-500 font-medium">
                            {realtimeEnabled ? 'Live' : 'Connecting...'}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 mt-10">
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}

                    {/* Typing Indicator */}
                    {typingUsers.length > 0 && (
                        <div className="flex justify-start">
                            <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-2xl rounded-bl-none text-sm flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                                <span className="text-xs">
                                    {typingUsers.length === 1
                                        ? `${typingUsers[0].name} is typing...`
                                        : `${typingUsers.length} people are typing...`}
                                </span>
                            </div>
                        </div>
                    )}

                    {messages.map((msg) => {
                        const isMyMessage = msg.user_id === userData?.id;
                        const isAi = msg.user_id === 'ai-tutor';
                        const canDelete = userData && (
                            userData.id === msg.user_id ||
                            userData.role === 'teacher' ||
                            group?.created_by === userData.id
                        );

                        return (
                            <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] lg:max-w-md px-5 py-3 rounded-2xl relative group shadow-sm ${isMyMessage ? 'bg-blue-600 text-white rounded-br-none' :
                                    isAi ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-2 border-purple-200' :
                                        msg._isFailed ? 'bg-red-50 text-red-800 border border-red-200 rounded-bl-none' :
                                            'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                                    } ${msg.id.toString().startsWith('temp-') && !msg._isFailed ? 'opacity-75' : ''}`}>

                                    {canDelete && !isAi && (
                                        <button
                                            onClick={() => deleteMessage(msg.id)}
                                            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md text-xs"
                                            title="Delete"
                                        >
                                            ✕
                                        </button>
                                    )}

                                    <p className={`font-bold text-xs mb-1 opacity-90 ${isMyMessage ? 'text-blue-100' : isAi ? 'text-purple-100' : 'text-gray-500'}`}>{msg.user_name}</p>
                                    {msg.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}

                                    {msg.file_url && (
                                        <div className="mt-2 rounded-lg overflow-hidden border border-white/20">
                                            {msg.file_type && msg.file_type.startsWith('image/') ? (
                                                <img
                                                    src={msg.file_url}
                                                    alt={msg.file_name || 'Shared image'}
                                                    className="max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => window.open(msg.file_url, '_blank')}
                                                />
                                            ) : (
                                                <a
                                                    href={msg.file_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center gap-2 p-2 bg-black/10 rounded ${isMyMessage ? 'text-white' : 'text-blue-600'}`}
                                                >
                                                    <span className="text-lg">📎</span>
                                                    <span className="text-sm underline truncate">{msg.file_name || 'Shared file'}</span>
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {msg._isFailed && (
                                        <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
                                            <span>⚠️ Failed to send</span>
                                            <button
                                                onClick={() => {
                                                    // Retry: remove failed and restore text
                                                    setMessages(prev => prev.filter(m => m.id !== msg.id));
                                                    setNewMessage(msg.text);
                                                }}
                                                className="underline hover:text-red-800 font-semibold"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}

                                    <p className={`text-[10px] mt-1 opacity-75 text-right w-full ${isMyMessage ? 'text-blue-100' : isAi ? 'text-purple-200' : msg._isFailed ? 'text-red-400' : 'text-gray-400'}`}>
                                        {msg.id.toString().startsWith('temp-') && !msg._isFailed
                                            ? 'Sending...'
                                            : msg._isFailed ? 'Failed'
                                                : new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        }
                                    </p>
                                </div>
                            </div>
                        );
                    })}

                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={sendMessage} className="p-4 bg-white border-t border-gray-100">
                    {chatFile && (
                        <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between animate-fade-in-up">
                            <div className="flex items-center gap-3">
                                {chatFile.type.startsWith('image/') ? (
                                    <img src={chatFilePreview} alt="Preview" className="h-10 w-10 object-cover rounded-lg shadow-sm" />
                                ) : (
                                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center text-xl shadow-sm">
                                        📄
                                    </div>
                                )}
                                <div className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{chatFile.name}</div>
                            </div>
                            <button type="button" onClick={clearChatFile} className="text-red-500 hover:bg-red-50 p-1 rounded-full">
                                ✕
                            </button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleChatFileSelect}
                            className="hidden"
                            accept="image/*,.pdf,.txt,.doc,.docx"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            📎
                        </button>
                        <input
                            type="text"
                            value={newMessage}
                            onChange={onMessageChange}
                            placeholder="Type a message..."
                            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition-all text-sm"
                        />
                        <button
                            type="submit"
                            disabled={messageSending || (!newMessage.trim() && !chatFile)}
                            className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition font-semibold disabled:opacity-50 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                        >
                            Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Chat;