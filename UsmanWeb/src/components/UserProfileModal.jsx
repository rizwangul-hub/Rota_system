import React, { useState, useRef } from 'react';
import { Camera, X, Check, RefreshCw, User, ShieldCheck, Trash2 } from 'lucide-react';
import api from '../services/api';
import logoDefault from '../assets/app-logo.png';
const usmanDefault = '/usman.png';
const adeelDefault = '/adeel.jpg';

/**
 * Compresses an image file to a maximum dimension and quality using HTML5 Canvas.
 * Prevents oversized base64 payloads from clogging the database or slowing mobile networks.
 */
function compressImage(file, maxDimension = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function UserProfileModal({ isOpen, onClose, user, onUserUpdated }) {
  const isAdeel = (user?.username === 'adeel') || (typeof user?.name === 'string' && /adeel/i.test(user.name));
  const isUsman = (user?.username === 'usman') || (typeof user?.name === 'string' && /usman/i.test(user.name));
  const fallbackPhoto = isAdeel ? adeelDefault : isUsman ? usmanDefault : logoDefault;

  const [name, setName] = useState(user?.name || '');
  const [photo, setPhoto] = useState(user?.profilePicture || fallbackPhoto);
  const [hasNewPhoto, setHasNewPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if valid image
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    try {
      setErrorMessage('');
      const compressed = await compressImage(file, 400, 0.85);
      setPhoto(compressed);
      setHasNewPhoto(true);
    } catch {
      setErrorMessage('Failed to process image. Please try another photo.');
    }
  };

  const handleResetToDefault = () => {
    setPhoto(fallbackPhoto);
    setHasNewPhoto(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Name cannot be empty.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        name: name.trim(),
        profilePicture: photo
      };

      const res = await api.put('/auth/profile', payload);

      if (res.data?.success) {
        setSuccessMessage('Profile updated successfully!');
        if (onUserUpdated) {
          onUserUpdated(res.data.user);
        }
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMessage(res.data?.message || 'Error updating profile.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Edit Profile"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '380px',
          padding: '24px',
          position: 'relative',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          textAlign: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            backgroundColor: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b'
          }}
        >
          <X size={16} />
        </button>

        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
          Operator Profile
        </h2>

        {/* Avatar with Camera Overlay */}
        <div style={{ position: 'relative', width: '96px', height: '96px', margin: '0 auto 16px auto' }}>
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              border: '3px solid #3b82f6',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              src={photo}
              alt={name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center top'
              }}
            />
          </div>

          {/* Camera Upload Trigger Badge */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Change Photo"
            style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: '2px solid #ffffff',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)'
            }}
          >
            <Camera size={16} />
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Change Photo Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '18px' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              border: '1px solid #bfdbfe',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Camera size={13} />
            <span>Upload New Photo</span>
          </button>

          {hasNewPhoto && (
            <button
              type="button"
              onClick={handleResetToDefault}
              title="Reset Photo"
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSave} style={{ textAlign: 'left' }}>
          {/* Full Name Field */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your Full Name"
              style={{
                width: '100%',
                height: '40px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '14px',
                fontWeight: 600,
                color: '#0f172a',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Username Field (Read-only) */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
              Username
            </label>
            <div
              style={{
                width: '100%',
                height: '40px',
                padding: '0 12px',
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: 600,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}
            >
              @{user?.username || 'user'}
            </div>
          </div>

          {/* Role Badge */}
          <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} color="#15803d" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>
              Attendance Operator
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '14px'
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#15803d',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Check size={14} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '10px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2,
                padding: '11px',
                borderRadius: '10px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
              }}
            >
              {saving ? <RefreshCw size={15} className="spin" /> : <Check size={15} />}
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
