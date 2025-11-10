import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
// FIX: `Unsubscribe` is a type from `firebase/firestore` and was not exported from the local firebase module.
// Importing it directly from the source library resolves the module resolution error.
import { auth, db, doc, addDoc, collection, onSnapshot, updateDoc, getDoc } from '../firebase';
import { User } from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';

// WebRTC configuration - using public STUN servers
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

type CallStatus = 'idle' | 'ringing-outgoing' | 'ringing-incoming' | 'connected' | 'ended' | 'declined' | 'cancelled';

interface UserInfo {
    id: string;
    username: string;
    avatar: string;
}

interface ActiveCall {
    callId: string;
    caller: UserInfo;
    receiver: UserInfo;
    status: CallStatus;
}

interface CallContextType {
    activeCall: ActiveCall | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    startCall: (receiver: UserInfo) => Promise<void>;
    answerCall: () => Promise<void>;
    hangUp: (isCleanupOnly?: boolean) => Promise<void>;
    declineCall: () => Promise<void>;
    setIncomingCall: (callData: any) => void;
    error: string | null;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    const pc = useRef<RTCPeerConnection | null>(null);
    const currentUser = auth.currentUser as User;
    
    const activeCallRef = useRef(activeCall);
    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);


    const resetCallState = useCallback(() => {
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setActiveCall(null);
        setError(null);
    }, [localStream]);

    // Effect for managing Firestore listeners based on activeCall
    useEffect(() => {
        if (!activeCall?.callId) return;
        
        const callId = activeCall.callId;
        const callDocRef = doc(db, 'calls', callId);
        
        const unsubs: Unsubscribe[] = [];

        // Listener for the main call document
        unsubs.push(onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) {
                resetCallState();
                return;
            };

            const status = data.status as CallStatus;
            const currentCall = activeCallRef.current; // Use ref for fresh state

            if (currentCall?.status === 'ringing-incoming' && status === 'cancelled') {
                resetCallState();
                return;
            }

            if (['ended', 'declined', 'cancelled'].includes(status) && currentCall?.status !== status) {
                 setActiveCall(prev => prev ? { ...prev, status } : null);
                 return;
            }
            
            if (!pc.current) return;

            if (data.answer && pc.current.remoteDescription?.type !== 'answer') {
                try {
                    await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                } catch (e) {
                    console.error("Error setting remote description:", e);
                }
            }
            
            if (data.status === 'connected' && currentCall?.status !== 'connected') {
                setActiveCall(prev => prev ? ({ ...prev, status: 'connected' }) : null);
            }
        }));
        
        if (pc.current) {
            const isCaller = activeCall.caller.id === currentUser?.uid;
            // Listen for ICE candidates from the other party
            const candidatesCollection = collection(db, 'calls', callId, isCaller ? 'receiverCandidates' : 'callerCandidates');
            unsubs.push(onSnapshot(candidatesCollection, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        pc.current?.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate:", e));
                    }
                });
            }));
        }


        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [activeCall, currentUser?.uid, resetCallState]);
    
    const partialCleanup = useCallback(() => {
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
    }, [localStream]);

    const startCall = async (receiver: UserInfo) => {
        console.log("Iniciando startCall para o receptor:", receiver.id);
        if (!currentUser || activeCall) {
            console.log("startCall abortada. Motivo:", { hasCurrentUser: !!currentUser, activeCall });
            return;
        }
        setError(null);
        let stream: MediaStream | null = null;
        try {
            console.log("Solicitando permissões de microfone...");
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Permissão de microfone concedida.");
            setLocalStream(stream);

            pc.current = new RTCPeerConnection(servers);
            stream.getTracks().forEach(track => pc.current?.addTrack(track, stream!));

            const callDocRef = await addDoc(collection(db, 'calls'), {
                callerId: currentUser.uid,
                callerUsername: currentUser.displayName,
                callerAvatar: currentUser.photoURL,
                receiverId: receiver.id,
                receiverUsername: receiver.username,
                receiverAvatar: receiver.avatar,
                status: 'ringing',
                offer: null,
                answer: null,
            });

            const callId = callDocRef.id;
            console.log("Documento de chamada criado no Firebase com ID:", callId);


            pc.current.onicecandidate = event => {
                if (event.candidate) {
                    addDoc(collection(db, 'calls', callId, 'callerCandidates'), event.candidate.toJSON());
                }
            };
            
            pc.current.ontrack = event => {
                setRemoteStream(event.streams[0]);
            };

            const offerDescription = await pc.current.createOffer();
            await pc.current.setLocalDescription(offerDescription);
            await updateDoc(callDocRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type } });
            console.log("Oferta criada e salva no Firebase.");


            setActiveCall({
                callId,
                caller: { id: currentUser.uid, username: currentUser.displayName || '', avatar: currentUser.photoURL || '' },
                receiver,
                status: 'ringing-outgoing'
            });

        } catch (err) {
            console.error("Erro ao iniciar a chamada:", err);
            partialCleanup();
            setError("call.noMicrophone");
        }
    };
    
    const setIncomingCall = (callData: any) => {
        setActiveCall({
            callId: callData.callId,
            caller: { id: callData.callerId, username: callData.callerUsername, avatar: callData.callerAvatar },
            receiver: { id: callData.receiverId, username: callData.receiverUsername, avatar: callData.receiverAvatar },
            status: 'ringing-incoming',
        });
    };

    const answerCall = async () => {
        if (!currentUser || !activeCall || activeCall.status !== 'ringing-incoming') return;
        setError(null);
        let stream: MediaStream | null = null;
        try {
            const callId = activeCall.callId;
            const callDocRef = doc(db, 'calls', callId);
            const callDocSnap = await getDoc(callDocRef);
            if (!callDocSnap.exists()) {
                throw new Error("Call not found.");
            }
            const callData = callDocSnap.data();

            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setLocalStream(stream);

            pc.current = new RTCPeerConnection(servers);
            stream.getTracks().forEach(track => pc.current?.addTrack(track, stream!));
            
            pc.current.onicecandidate = event => {
                if (event.candidate) {
                    addDoc(collection(db, 'calls', callId, 'receiverCandidates'), event.candidate.toJSON());
                }
            };

            pc.current.ontrack = event => {
                setRemoteStream(event.streams[0]);
            };
            
            await pc.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);
            await updateDoc(callDocRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type }, status: 'connected' });
            
            setActiveCall(prev => prev ? ({ ...prev, status: 'connected' }) : null);

        } catch (err) {
            console.error("Error answering call:", err);
            partialCleanup();
            setError("call.callError");
        }
    };
    
    const hangUp = useCallback(async (isCleanupOnly = false) => {
        const call = activeCallRef.current;
        if (call && !isCleanupOnly) {
            const callDocRef = doc(db, 'calls', call.callId);
            const callDoc = await getDoc(callDocRef);
            if(callDoc.exists() && !['ended', 'declined', 'cancelled'].includes(callDoc.data().status)) {
                let newStatus: CallStatus = 'ended';
                 if (call.status === 'ringing-outgoing') {
                    newStatus = 'cancelled';
                }
                await updateDoc(callDocRef, { status: newStatus });
            }
        }
        resetCallState();
    }, [resetCallState]);

    const declineCall = useCallback(async () => {
        const call = activeCallRef.current;
        if(call) {
            const callDocRef = doc(db, 'calls', call.callId);
            await updateDoc(callDocRef, { status: 'declined' });
        }
        resetCallState();
    }, [resetCallState]);

    // Auto-hangup on window close
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (activeCallRef.current) {
                hangUp();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hangUp]);

    const value = {
        activeCall,
        localStream,
        remoteStream,
        startCall,
        answerCall,
        hangUp,
        declineCall,
        setIncomingCall,
        error
    };

    return (
        <CallContext.Provider value={value}>
            {children}
        </CallContext.Provider>
    );
};

export const useCall = (): CallContextType => {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
};
