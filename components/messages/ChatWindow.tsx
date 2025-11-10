import React, { useState, useEffect, useRef } from 'react';
import { 
    auth, 
    db, 
    doc, 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    writeBatch, 
    serverTimestamp,
    deleteDoc,
    updateDoc,
    getDocs,
    limit,
    getDoc,
    storage,
    storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from '../../firebase';
import ConnectionCrystal from './ConnectionCrystal';
import OnlineIndicator from '../common/OnlineIndicator';
import { useLanguage } from '../../context/LanguageContext';
import { useCall } from '../../context/CallContext';

interface ForwardedPostProps {
  content: {
    originalPosterAvatar: string;
    originalPosterUsername: string;
    imageUrl: string;
    caption: string;
  };
}

const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const AudioPlayer: React.FC<{ src: string }> = ({ src }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
  
    const togglePlayPause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().catch(console.error);
            }
        }
    };
  
    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            const setAudioData = () => {
                if (isFinite(audio.duration)) {
                    setDuration(audio.duration);
                }
                setCurrentTime(audio.currentTime);
            };
            const setAudioTime = () => setCurrentTime(audio.currentTime);
            const onPlay = () => setIsPlaying(true);
            const onPause = () => setIsPlaying(false);

            audio.addEventListener('loadedmetadata', setAudioData);
            audio.addEventListener('timeupdate', setAudioTime);
            audio.addEventListener('play', onPlay);
            audio.addEventListener('pause', onPause);
            audio.addEventListener('ended', onPause);
    
            return () => {
                audio.removeEventListener('loadedmetadata', setAudioData);
                audio.removeEventListener('timeupdate', setAudioTime);
                audio.removeEventListener('play', onPlay);
                audio.removeEventListener('pause', onPause);
                audio.removeEventListener('ended', onPause);
            };
        }
    }, []);
  
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  
    return (
        <div className="flex items-center gap-2 w-full p-2 text-inherit">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button onClick={togglePlayPause} className="flex-shrink-0">
                {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
            </button>
            <div className="w-full bg-zinc-300 dark:bg-zinc-700 rounded-full h-1.5 flex-grow">
                <div style={{ width: `${progress}%` }} className="bg-current h-1.5 rounded-full"></div>
            </div>
            <span className="text-xs font-mono flex-shrink-0">{formatTime(duration > 0 ? currentTime : 0)}</span>
        </div>
    );
};

const ForwardedPost: React.FC<ForwardedPostProps> = ({ content }) => {
  return (
    <div className="p-2">
        <div className="border border-zinc-300 dark:border-zinc-700 rounded-xl overflow-hidden w-60 bg-white dark:bg-black">
            <div className="p-2 flex items-center gap-2">
                <img src={content.originalPosterAvatar} alt={content.originalPosterUsername} className="w-6 h-6 rounded-full" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{content.originalPosterUsername}</span>
            </div>
            <img src={content.imageUrl} alt="Forwarded post" className="w-full aspect-square object-cover" />
            {content.caption && <p className="text-xs p-2 truncate text-zinc-600 dark:text-zinc-400">{content.caption}</p>}
        </div>
    </div>
  );
};


interface ChatWindowProps {
    conversationId: string | null;
    onBack: () => void;
    isCurrentUserAnonymous: boolean;
}

interface Message {
    id: string;
    senderId: string;
    text: string;
    timestamp: any;
    replyTo?: {
        messageId: string;
        senderId: string;
        senderUsername: string;
        text: string;
    };
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'forwarded_post' | 'audio';
    forwardedPostData?: {
        postId: string;
        imageUrl: string;
        originalPosterUsername: string;
        originalPosterAvatar: string;
        caption: string;
    };
}

interface OtherUser {
    id: string;
    username: string;
    avatar: string;
}

type CrystalLevel = 'BRILHANTE' | 'EQUILIBRADO' | 'APAGADO' | 'RACHADO';

interface CrystalData {
    createdAt: any;
    lastInteractionAt: any;
    level: CrystalLevel;
    streak: number;
}

interface ConversationData {
    participants: string[];
    participantInfo: {
        [key: string]: {
            username: string;
            avatar: string;
            lastSeenMessageTimestamp?: any;
        }
    };
    lastMessage?: {
        senderId: string;
        text: string;
        timestamp: any;
    };
    crystal?: CrystalData;
}


function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}


const TrashIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const ReplyIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l-6-6m0 0l6-6M3 9h12a6 6 0 016 6v3" />
    </svg>
);

const BackArrowIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
);

const PlusCircleIcon: React.FC<{className?: string}> = ({className = "h-6 w-6"}) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const XIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const Spinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 01-14 0v-2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19v3" />
    </svg>
);
  
const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.722-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
    </svg>
);

const PauseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75zm9 0a.75.75 0 01.75.75v12a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75z" clipRule="evenodd" />
    </svg>
);

const CallIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
);

const VideoIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
    </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
);

const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, onBack, isCurrentUserAnonymous }) => {
    const { t } = useLanguage();
    const { startCall, activeCall } = useCall();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [conversationData, setConversationData] = useState<ConversationData | null>(null);
    const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
    const [isOnline, setIsOnline] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'recorded'>('idle');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recordingStartTimeRef = useRef<number>(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const currentUser = auth.currentUser;
    const prevMessages = usePrevious(messages);
    
    useEffect(() => {
        if (messagesEndRef.current && (!prevMessages || prevMessages.length < messages.length)) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, prevMessages]);

    useEffect(() => {
        if (!conversationId) {
            setLoading(false);
            return;
        }

        const messagesRef = collection(db, 'conversations', conversationId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
            setMessages(msgs);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [conversationId]);
    
    useEffect(() => {
        if (!conversationId) return;

        const convRef = doc(db, 'conversations', conversationId);
        const unsubscribe = onSnapshot(convRef, (docSnap) => {
            if (docSnap.exists() && currentUser) {
                const data = docSnap.data() as ConversationData;
                setConversationData(data);
                const otherUserId = data.participants.find(p => p !== currentUser.uid);
                if (otherUserId && data.participantInfo[otherUserId]) {
                    setOtherUser({
                        id: otherUserId,
                        username: data.participantInfo[otherUserId].username,
                        avatar: data.participantInfo[otherUserId].avatar,
                    });
                }
            }
        });
        
        return () => unsubscribe();
    }, [conversationId, currentUser]);
    
    useEffect(() => {
        if (!otherUser) return;
        const userStatusRef = doc(db, 'users', otherUser.id);
        const unsubscribe = onSnapshot(userStatusRef, (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                const lastSeen = userData.lastSeen;
                const isUserOnline = !userData.isAnonymous && lastSeen && (new Date().getTime() / 1000 - lastSeen.seconds) < 600;
                setIsOnline(isUserOnline);
            }
        });
        return () => unsubscribe();
    }, [otherUser]);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!conversationId || !currentUser || messages.length === 0 || !otherUser) return;

        const conversationRef = doc(db, 'conversations', conversationId);

        getDoc(conversationRef).then(docSnap => {
            if (!docSnap.exists()) return;
            const convData = docSnap.data() as ConversationData;
            const myInfo = convData.participantInfo?.[currentUser.uid];
            const lastMessage = convData.lastMessage;

            // Condition: there is a last message, it's from the other user, and it's newer than my last seen time.
            if (lastMessage && lastMessage.senderId === otherUser.id && (!myInfo?.lastSeenMessageTimestamp || lastMessage.timestamp.seconds > myInfo.lastSeenMessageTimestamp.seconds)) {
                const batch = writeBatch(db);

                // Update my 'lastSeen' timestamp
                batch.update(conversationRef, {
                    [`participantInfo.${currentUser.uid}.lastSeenMessageTimestamp`]: serverTimestamp()
                });

                // Create a "seen" notification for the other user
                const notificationRef = doc(collection(db, 'users', otherUser.id, 'notifications'));
                batch.set(notificationRef, {
                    type: 'message_seen',
                    fromUserId: currentUser.uid,
                    fromUsername: currentUser.displayName,
                    fromUserAvatar: currentUser.photoURL,
                    timestamp: serverTimestamp(),
                    read: false,
                    conversationId: conversationId,
                });

                batch.commit().catch(console.error);
            }
        });
    }, [conversationId, messages, currentUser, otherUser]);

    const handleSendMessage = async (text: string, mediaData?: { url: string, type: 'image' | 'video' | 'audio' }) => {
        const currentUser = auth.currentUser;
        if ((!text.trim() && !mediaData) || !currentUser || !conversationId) return;
    
        const messageText = text.trim();
        
        try {
          const batch = writeBatch(db);
          
          const messagesRef = collection(db, 'conversations', conversationId, 'messages');
          const newMessageRef = doc(messagesRef);
          const messageData: any = {
            senderId: currentUser.uid,
            text: messageText,
            timestamp: serverTimestamp(),
            isAnonymous: isCurrentUserAnonymous,
          };
           if (replyingTo) {
            messageData.replyTo = replyingTo;
          }
          if (mediaData) {
              messageData.mediaUrl = mediaData.url;
              messageData.mediaType = mediaData.type;
          }
          batch.set(newMessageRef, messageData);
    
          const conversationRef = doc(db, 'conversations', conversationId);
          batch.update(conversationRef, {
            lastMessage: {
              senderId: currentUser.uid,
              text: mediaData ? '' : messageText,
              timestamp: serverTimestamp(),
              mediaType: mediaData?.type,
            },
            timestamp: serverTimestamp(),
          });
          
          await batch.commit();
    
          setNewMessage('');
          setReplyingTo(null);
          setMediaFile(null);
          setMediaPreview(null);
    
        } catch (error) {
          console.error("Error sending message: ", error);
        }
    };
    

    const handleDeleteMessage = async (messageId: string) => {
        if (!conversationId) return;
        setDeleting(true);
        try {
            const messageToDelete = messages.find(m => m.id === messageId);
            if (messageToDelete && messageToDelete.mediaUrl) {
                try {
                    const fileRef = storageRef(storage, messageToDelete.mediaUrl);
                    await deleteObject(fileRef);
                } catch (storageError: any) {
                    if (storageError.code !== 'storage/object-not-found') {
                        console.error("Could not delete media from storage:", storageError);
                    }
                }
            }

            const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
            await deleteDoc(messageRef);

            // If it was the last message, update the conversation's lastMessage field
            if (messages.length > 0 && messages[messages.length - 1].id === messageId) {
                const conversationRef = doc(db, 'conversations', conversationId);
                const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('timestamp', 'desc'), limit(1));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const newLastMessage = snapshot.docs[0].data();
                    await updateDoc(conversationRef, {
                        lastMessage: {
                            senderId: newLastMessage.senderId,
                            text: newLastMessage.text,
                            timestamp: newLastMessage.timestamp,
                        }
                    });
                } else {
                     await updateDoc(conversationRef, { lastMessage: null });
                }
            }
            setShowDeleteConfirm(null);
        } catch (error) {
            console.error("Error deleting message:", error);
        } finally {
            setDeleting(false);
        }
    };

    if (!conversationId) return null;

    if (loading) {
        return <div className="p-4 text-center text-sm text-zinc-500">{t('messages.loading')}</div>;
    }
    
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = recorder;
            const audioChunks: Blob[] = [];

            recorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            recorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                setAudioBlob(audioBlob);
                setAudioPreviewUrl(URL.createObjectURL(audioBlob));
                setRecordingState('recorded');
            };

            recorder.start();
            setRecordingState('recording');
            setRecordingTime(0);
            recordingStartTimeRef.current = Date.now();
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
            recordingIntervalRef.current = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
                setRecordingTime(elapsed);
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && recordingState === 'recording') {
            mediaRecorderRef.current.stop();
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
        }
    };

    const handleCancelRecording = () => {
        setRecordingState('idle');
        setAudioBlob(null);
        if (audioPreviewUrl) {
            URL.revokeObjectURL(audioPreviewUrl);
        }
        setAudioPreviewUrl(null);
        setRecordingTime(0);
    };

    const handleSendAudio = async (audioBlob: Blob) => {
        if (!currentUser || !conversationId || !audioBlob) return;
        setUploading(true);
        try {
            const audioRef = storageRef(storage, `audioMessages/${conversationId}/${Date.now()}.webm`);
            const snapshot = await uploadBytes(audioRef, audioBlob);
            const downloadURL = await getDownloadURL(snapshot.ref);
            await handleSendMessage('', { url: downloadURL, type: 'audio' });
        } catch (error) {
            console.error("Error uploading audio:", error);
        } finally {
            setUploading(false);
            handleCancelRecording();
        }
    };
    
    const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {};
    
    const renderFooterContent = () => {
        switch (recordingState) {
            case 'recording':
                return (
                    <div className="flex items-center gap-3 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full px-2 py-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping ml-2"></div>
                        <div className="w-2 h-2 bg-red-500 rounded-full -ml-4"></div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">{t('messages.recording')}</p>
                        <p className="text-sm font-mono text-zinc-500 dark:text-zinc-400 flex-grow">{formatTime(recordingTime)}</p>
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="p-2 text-sky-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full"
                            aria-label={t('messages.stopRecording')}
                        >
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"></path></svg>
                        </button>
                    </div>
                );
            case 'recorded':
                return (
                    <div className="flex items-center gap-2 w-full">
                        <button type="button" onClick={handleCancelRecording} className="p-2" aria-label={t('messages.cancelRecording')}>
                            <TrashIcon className="w-6 h-6 text-zinc-500" />
                        </button>
                        <div className="flex-grow bg-zinc-100 dark:bg-zinc-900 rounded-full">
                            {audioPreviewUrl && <AudioPlayer src={audioPreviewUrl} />}
                        </div>
                        <button
                            type="button"
                            onClick={() => audioBlob && handleSendAudio(audioBlob)}
                            className="p-2 rounded-full bg-sky-500 text-white disabled:opacity-50"
                            disabled={uploading || !audioBlob}
                            aria-label={t('messages.sendAudio')}
                        >
                            {uploading ? <Spinner /> : <SendIcon className="w-6 h-6" />}
                        </button>
                    </div>
                );
            case 'idle':
            default:
                return (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (newMessage.trim() !== '') {
                                handleSendMessage(newMessage.trim());
                            }
                        }}
                        className="flex items-center gap-2"
                    >
                        <input
                            type="file"
                            id="media-upload"
                            className="hidden"
                            onChange={handleMediaSelect}
                            accept="image/*,video/mp4,video/quicktime"
                        />
                        <label htmlFor="media-upload" className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                            <PlusCircleIcon className="w-6 h-6 text-sky-500"/>
                        </label>
                        <div className="flex-grow relative">
                            <input
                                type="text"
                                placeholder={t('messages.messagePlaceholder')}
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="w-full bg-zinc-100 dark:bg-zinc-900 border-none rounded-full py-2 px-4 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                        </div>
                        {newMessage.trim() === '' ? (
                            <button
                                type="button"
                                onClick={startRecording}
                                className="p-2"
                                aria-label={t('messages.media.audio')}
                            >
                                <MicrophoneIcon className="w-6 h-6 text-zinc-500"/>
                            </button>
                        ) : (
                            <button type="submit" className="text-sky-500 font-semibold disabled:opacity-50" disabled={!newMessage.trim()}>
                                {t('messages.send')}
                            </button>
                        )}
                    </form>
                );
        }
    }


    return (
        <div className="h-full flex flex-col">
            <header className="flex items-center gap-3 p-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                <button onClick={onBack} aria-label={t('messages.back')}>
                   <BackArrowIcon className="w-6 h-6" />
                </button>
                {otherUser && (
                     <div className="flex items-center gap-3 flex-grow">
                        <div className="relative">
                            <img src={otherUser.avatar} alt={otherUser.username} className="w-10 h-10 rounded-full object-cover" />
                            {isOnline && <OnlineIndicator />}
                        </div>
                        <div className="flex-grow">
                             <p className="font-semibold">{otherUser.username}</p>
                             {isOnline && <p className="text-xs text-green-500">{t('common.online')}</p>}
                        </div>
                        {conversationData?.crystal && <ConnectionCrystal level={conversationData.crystal.level} className="w-8 h-8"/>}
                    </div>
                )}
                <div className="flex items-center gap-2">
                     <button 
                        onClick={() => { if (otherUser) startCall(otherUser); }}
                        disabled={!!activeCall}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full disabled:opacity-50 disabled:cursor-not-allowed" 
                        title={t('call.voiceCall')}>
                        <CallIcon className="w-5 h-5" />
                    </button>
                    <button 
                         onClick={() => { console.log("Video call button clicked"); }}
                        disabled={!!activeCall}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full disabled:opacity-50 disabled:cursor-not-allowed" 
                        title={t('call.videoCall')}>
                        <VideoIcon className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="flex-grow p-4 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
                {messages.map((msg) => {
                     const isMe = msg.senderId === currentUser?.uid;
                     const senderInfo = isMe ? null : otherUser;
                     return (
                        <div key={msg.id} className={`flex items-end gap-2 group mb-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {!isMe && (
                                <img src={senderInfo?.avatar} alt={senderInfo?.username} className="w-6 h-6 rounded-full self-start" />
                            )}
                            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                {msg.replyTo && (
                                    <div className={`text-xs p-1.5 rounded-t-lg max-w-xs w-fit
                                        ${isMe ? 'bg-zinc-200 dark:bg-zinc-700' : 'bg-zinc-200 dark:bg-zinc-700'}
                                        border-b border-zinc-300 dark:border-zinc-600`}>
                                        <p className="font-bold">
                                            {msg.replyTo.senderId === currentUser?.uid ? t('messages.replyingToSelf') : t('messages.replyingToOther', { username: msg.replyTo.senderUsername })}
                                        </p>
                                        <p className="opacity-80 truncate">{msg.replyTo.text}</p>
                                    </div>
                                )}
                                <div className={`relative rounded-lg max-w-xs w-fit
                                    ${isMe ? 'bg-sky-500 text-white rounded-br-none' : 'bg-white dark:bg-black border dark:border-zinc-800 rounded-bl-none'}
                                    ${msg.replyTo ? (isMe ? '!rounded-tr-lg' : '!rounded-tl-lg') : ''}
                                    ${!msg.text ? '!p-0' : 'p-2'}
                                    `}
                                >
                                    {msg.mediaType === 'audio' && msg.mediaUrl && <AudioPlayer src={msg.mediaUrl} />}
                                    {msg.mediaType === 'forwarded_post' && msg.forwardedPostData && (
                                        <ForwardedPost content={msg.forwardedPostData} />
                                    )}
                                    {msg.text && <div className="p-2 whitespace-pre-wrap break-words">{msg.text}</div>}

                                    <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1
                                        ${isMe ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'}`}>
                                         <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-600"><ReplyIcon className="w-4 h-4" /></button>
                                        {isMe && <button onClick={() => setShowDeleteConfirm(msg.id)} className="p-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-600"><TrashIcon className="w-4 h-4" /></button>}
                                    </div>

                                     {showDeleteConfirm === msg.id && (
                                        <div className="absolute top-0 right-full mr-2 w-48 bg-white dark:bg-black border dark:border-zinc-800 p-2 rounded-lg shadow-lg z-10">
                                            <p className="text-sm">{t('messages.deleteTitle')}</p>
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={() => setShowDeleteConfirm(null)} className="text-xs w-full p-1 rounded bg-zinc-200 dark:bg-zinc-700">{t('common.cancel')}</button>
                                                <button onClick={() => handleDeleteMessage(msg.id)} disabled={deleting} className="text-xs w-full p-1 rounded bg-red-500 text-white disabled:opacity-50">
                                                    {deleting ? '...' : t('common.delete')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                     )
                })}
                 <div ref={messagesEndRef} />
            </main>
            
            <footer className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0">
                {replyingTo && (
                     <div className="bg-zinc-100 dark:bg-zinc-900 p-2 rounded-t-md border-b-2 border-sky-500">
                         <div className="flex justify-between items-center">
                            <div className="text-xs overflow-hidden">
                                <p className="font-bold">
                                    {replyingTo.senderId === currentUser?.uid ? t('messages.replyingToSelf') : t('messages.replyingToOther', { username: otherUser?.username || 'User' })}
                                </p>
                                <p className="opacity-80 truncate">{replyingTo.text}</p>
                            </div>
                            <button onClick={() => setReplyingTo(null)}><XIcon className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
                {renderFooterContent()}
            </footer>
        </div>
    );
};

export default ChatWindow;