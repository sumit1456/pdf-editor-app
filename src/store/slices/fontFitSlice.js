import { createSlice } from '@reduxjs/toolkit';

// PERSISTENCE HELPER: Load from sessionStorage if available
const loadInitialState = () => {
  try {
    const saved = sessionStorage.getItem('fontFitSnapshot');
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

export const fontFitSlice = createSlice({
  name: 'fontFit',
  initialState: {
    activeLine: loadInitialState(), // Hydra from storage
  },
  reducers: {
    setActiveLine: (state, action) => {
      console.log("[REDUX] Setting Active Line Payload:", action.payload);
      state.activeLine = action.payload;
      // Persistence
      sessionStorage.setItem('fontFitSnapshot', JSON.stringify(action.payload));
    },
    clearActiveLine: (state) => {
      state.activeLine = null;
      sessionStorage.removeItem('fontFitSnapshot');
    }
  },
});

export const { setActiveLine, clearActiveLine } = fontFitSlice.actions;
export default fontFitSlice.reducer;
