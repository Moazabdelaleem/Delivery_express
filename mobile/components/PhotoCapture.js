import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, Alert } from 'react-native';

export default function PhotoCapture({
  orderId,
  stage,
  required = false,
  token,
  apiBase = 'http://localhost:5000/api',
  onPhotoCaptured,
  label = 'Attach Photo'
}) {
  const [imageUri, setImageUri]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded]   = useState(null);

  const handlePickPhoto = async () => {
    try {
      let ImagePicker;
      try {
        ImagePicker = require('expo-image-picker');
      } catch (_) {
        ImagePicker = null;
      }

      let result;
      if (ImagePicker && ImagePicker.launchCameraAsync) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          base64: true,
          quality: 0.85,
          allowsEditing: false
        });
      } else {
        Alert.alert('Image Picker', 'Camera feature ready in native environment.');
        return;
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64Image = `data:image/jpeg;base64,${asset.base64}`;
        setImageUri(asset.uri);

        if (orderId && token) {
          setUploading(true);
          const response = await fetch(`${apiBase}/orders/${orderId}/attachments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              stage,
              image: base64Image,
              is_required: required
            })
          });

          const data = await response.json();
          if (response.ok) {
            setUploaded(data.attachment);
            if (onPhotoCaptured) {
              onPhotoCaptured(data.attachment.storage_url, data.attachment.id);
            }
          } else {
            Alert.alert('Upload Failed', data.error || 'Failed to upload photo.');
          }
        }
      }
    } catch (err) {
      console.error('Error capturing photo:', err);
      Alert.alert('Error', 'Failed to capture or upload photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, uploaded ? styles.containerUploaded : (required && !uploaded ? styles.containerRequired : {})]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          {label} {required && <Text style={styles.requiredText}>* (Required)</Text>}
        </Text>
        {uploaded && <Text style={styles.uploadedText}>Uploaded ({stage})</Text>}
      </View>

      {imageUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: imageUri }} style={styles.thumbnail} />
          {uploading && (
            <View style={styles.overlay}>
              <ActivityIndicator color="#ffffff" />
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.captureButton} onPress={handlePickPhoto} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.buttonText}>Take Photo / Pick Image</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    marginVertical: 8
  },
  containerUploaded: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4'
  },
  containerRequired: {
    borderColor: '#eab308'
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  requiredText: {
    color: '#dc2626',
    fontWeight: '700'
  },
  uploadedText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '700'
  },
  previewContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 6,
    overflow: 'hidden'
  },
  thumbnail: {
    width: '100%',
    height: '100%'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  captureButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center'
  },
  buttonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13
  }
});
