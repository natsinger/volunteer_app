import React, { useState } from 'react';
import { Upload, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { parseBulkUploadAI } from '../services/geminiService';
import { Volunteer } from '../types';

interface BulkUploadModalProps {
  onClose: () => void;
  onUpload: (newVolunteers: Volunteer[]) => void;
}

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ onClose, onUpload }) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      let parsedData: any[] = [];
      let isManualParse = false;

      // Try parsing as JSON first (handling the specific format provided by user)
      try {
        const jsonData = JSON.parse(inputText);
        if (Array.isArray(jsonData)) {
          parsedData = jsonData;
          isManualParse = true;
        }
      } catch (e) {
        // Not valid JSON, ignore and fall through to AI
      }

      if (!isManualParse) {
        // Use AI if not direct JSON
        parsedData = await parseBulkUploadAI(inputText);
      }
      
      // Transform partial data into full Volunteer objects
      const newVolunteers: Volunteer[] = parsedData.map((v: any, index: number) => {
        // Handle specific fields from the provided JSON format
        const name = v.fullName || v.name || 'Unknown';
        const role = v.role || 'NOVICE';
        // Default skill level based on role if not present
        let level: 1 | 2 | 3 = v.skillLevel || 1;
        if (!v.skillLevel) {
          if (role === 'EXPERIENCED') level = 3;
          else level = 1;
        }
        
        return {
          id: v.id || `v-bulk-${Date.now()}-${index}`,
          name: name,
          email: v.email || `pending-${index}@example.com`,
          phone: v.phone || '',
          role: role,
          skillLevel: level,
          frequency: v.frequency || 'TWICE_A_MONTH',
          preferredLocation: v.preferredLocation || 'BOTH',
          // Derive skills from role if not provided explicitly
          skills: v.skills || (role === 'EXPERIENCED' ? ['Experienced', 'Leadership'] : ['General']),
          // Handle flattened preferredDays (supports ["0", "2_evening"] format directly)
          preferredDays: Array.isArray(v.preferredDays) ? v.preferredDays : [],
          blackoutDates: Array.isArray(v.blackoutDates) ? v.blackoutDates : [],
          onlyDates: Array.isArray(v.onlyDates) ? v.onlyDates : [],
          availabilityStatus: 'Active',
          serialNumber: v.serialNumber
        };
      });

      onUpload(newVolunteers);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to process data. Please check the format or try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 relative animate-fade-in">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
            <Upload size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bulk Upload Volunteers</h2>
            <p className="text-slate-500 text-sm">Paste JSON array, CSV, or text data.</p>
          </div>
        </div>

        <textarea
          className="w-full h-64 p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs mb-4"
          placeholder={`[
  {
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "EXPERIENCED",
    "skillLevel": 2,
    "frequency": "ONCE_A_WEEK",
    "preferredDays": ["0", "2_evening"]
  }
]`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isProcessing}
        />

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || !inputText.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Process & Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;