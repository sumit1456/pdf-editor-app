import { configureStore } from '@reduxjs/toolkit';
import fontFitReducer from './slices/fontFitSlice';

export const store = configureStore({
  reducer: {
    fontFit: fontFitReducer,
  },
});

export default store;
