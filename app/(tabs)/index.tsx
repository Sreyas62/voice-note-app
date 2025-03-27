import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Platform } from 'react-native';
import { Folder, Plus, Search, X, Save, Play, Pause, CreditCard as Edit2 } from 'lucide-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { router } from 'expo-router';

interface Recording {
  id: string;
  name: string;
  uri: string;
  duration: number;
  createdAt: string;
}

interface Folder {
  id: string;
  name: string;
  recordings: Recording[];
  createdAt: string;
}

const STORAGE_KEY = 'audio_folders';

export default function HomeScreen() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [newRecordingName, setNewRecordingName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [tempRecording, setTempRecording] = useState<Recording | null>(null);
  const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  useEffect(() => {
    loadFolders();
    return () => {
      if (sound) sound.unloadAsync();
      if (previewSound) previewSound.unloadAsync();
    };
  }, []);

  const loadFolders = async () => {
    try {
      if (Platform.OS === 'web') {
        const storedFolders = localStorage.getItem(STORAGE_KEY);
        if (storedFolders) {
          setFolders(JSON.parse(storedFolders));
        } else {
          setFolders([]);
        }
      } else {
        const foldersDir = `${FileSystem.documentDirectory}folders`;
        await FileSystem.makeDirectoryAsync(foldersDir, { intermediates: true });
        const foldersFile = `${foldersDir}/folders.json`;
        
        const fileInfo = await FileSystem.getInfoAsync(foldersFile);
        if (!fileInfo.exists) {
          await FileSystem.writeAsStringAsync(foldersFile, JSON.stringify([]));
          return;
        }

        const content = await FileSystem.readAsStringAsync(foldersFile);
        setFolders(JSON.parse(content));
      }
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  const saveFolders = async (updatedFolders: Folder[]) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFolders));
      } else {
        const foldersDir = `${FileSystem.documentDirectory}folders`;
        const foldersFile = `${foldersDir}/folders.json`;
        await FileSystem.writeAsStringAsync(foldersFile, JSON.stringify(updatedFolders));
      }
    } catch (error) {
      console.error('Error saving folders:', error);
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      const newFolder: Folder = {
        id: Date.now().toString(),
        name: newFolderName,
        recordings: [],
        createdAt: new Date().toISOString(),
      };

      const updatedFolders = [...folders, newFolder];
      setFolders(updatedFolders);
      await saveFolders(updatedFolders);
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    if (!recording || !selectedFolder) return;

    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    
    const newRecording: Recording = {
      id: Date.now().toString(),
      name: `Recording ${selectedFolder.recordings.length + 1}`,
      uri,
      duration: 0,
      createdAt: new Date().toISOString(),
    };

    setTempRecording(newRecording);
    setNewRecordingName(newRecording.name);
    
    // Load the recording for preview
    try {
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setPreviewSound(newSound);
    } catch (error) {
      console.error('Error loading preview:', error);
    }
    
    setShowRenameModal(true);
    setRecording(null);
  }

  const previewRecording = async () => {
    if (!previewSound) return;

    try {
      if (isPreviewPlaying) {
        await previewSound.stopAsync();
        setIsPreviewPlaying(false);
      } else {
        await previewSound.playAsync();
        setIsPreviewPlaying(true);
        previewSound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            setIsPreviewPlaying(false);
          }
        });
      }
    } catch (error) {
      console.error('Error playing preview:', error);
    }
  };

  const saveRecording = async () => {
    if (!tempRecording || !selectedFolder) return;

    if (previewSound) {
      await previewSound.unloadAsync();
      setPreviewSound(null);
    }

    const updatedRecording = { ...tempRecording, name: newRecordingName };
    const updatedFolder = {
      ...selectedFolder,
      recordings: [...selectedFolder.recordings, updatedRecording],
    };

    const updatedFolders = folders.map(f =>
      f.id === selectedFolder.id ? updatedFolder : f
    );

    setFolders(updatedFolders);
    await saveFolders(updatedFolders);
    setSelectedFolder(updatedFolder);
    setShowRenameModal(false);
    setTempRecording(null);
    setIsPreviewPlaying(false);
  };

  const playRecording = async (recording: Recording) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: recording.uri });
      setSound(newSound);
      setIsPlaying(true);
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      console.error('Error playing recording:', error);
    }
  };

  const stopPlaying = async () => {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const filteredFolders = folders.filter(folder =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Recordings</Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search folders..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearSearch}>
            <X size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {selectedFolder ? (
        <View style={styles.folderView}>
          <View style={styles.folderHeader}>
            <TouchableOpacity
              onPress={() => setSelectedFolder(null)}
              style={styles.backButton}>
              <X size={24} color="#666" />
            </TouchableOpacity>
            <Text style={styles.folderTitle}>{selectedFolder.name}</Text>
          </View>

          <ScrollView style={styles.recordingsList}>
            {selectedFolder.recordings.map((rec) => (
              <Animated.View
                key={rec.id}
                entering={FadeInUp}
                style={styles.recordingItem}>
                <View style={styles.recordingInfo}>
                  <Text style={styles.recordingName}>{rec.name}</Text>
                  <Text style={styles.recordingDate}>
                    {new Date(rec.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => isPlaying ? stopPlaying() : playRecording(rec)}
                  style={styles.playButton}>
                  {isPlaying ? (
                    <Pause size={24} color="#007AFF" />
                  ) : (
                    <Play size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.recordButton}
            onPress={isRecording ? stopRecording : startRecording}>
            <View style={[styles.recordButtonInner, isRecording && styles.recording]} />
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.folderList}>
          {filteredFolders.map((folder, index) => (
            <TouchableOpacity
              key={folder.id}
              onPress={() => setSelectedFolder(folder)}>
              <Animated.View
                entering={FadeInUp.delay(index * 100)}
                style={styles.folderItem}>
                <Folder size={24} color="#007AFF" />
                <View style={styles.folderInfo}>
                  <Text style={styles.folderName}>{folder.name}</Text>
                  <Text style={styles.recordingsCount}>
                    {folder.recordings.length} recordings
                  </Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {!selectedFolder && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setIsCreatingFolder(true)}>
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={isCreatingFolder}
        transparent
        animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Folder</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Folder name"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateFolder}>
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Save Recording</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Recording name"
              value={newRecordingName}
              onChangeText={setNewRecordingName}
              autoFocus
            />
            <TouchableOpacity
              onPress={previewRecording}
              style={styles.previewButton}>
              {isPreviewPlaying ? (
                <Pause size={24} color="#007AFF" />
              ) : (
                <Play size={24} color="#007AFF" />
              )}
              <Text style={styles.previewButtonText}>
                {isPreviewPlaying ? 'Stop Preview' : 'Preview Recording'}
              </Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowRenameModal(false);
                  if (previewSound) {
                    previewSound.unloadAsync();
                    setPreviewSound(null);
                  }
                }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={saveRecording}>
                <Text style={styles.createButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter_600SemiBold',
    color: '#1a1a1a',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    margin: 20,
    borderRadius: 12,
    padding: 12,
  },
  searchIcon: {
    marginRight: 10,
  },
  clearSearch: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  folderList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 12,
  },
  folderInfo: {
    marginLeft: 12,
  },
  folderName: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#1a1a1a',
  },
  recordingsCount: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e1e1e1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  previewButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#007AFF',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#f1f1f1',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#666',
    fontFamily: 'Inter_500Medium',
  },
  createButtonText: {
    color: '#fff',
    fontFamily: 'Inter_500Medium',
  },
  folderView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  folderTitle: {
    fontSize: 24,
    fontFamily: 'Inter_600SemiBold',
  },
  recordingsList: {
    flex: 1,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 12,
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  recordingDate: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 2,
  },
  playButton: {
    padding: 8,
  },
  recordButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  recordButtonInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
  },
  recording: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
});