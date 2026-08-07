import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyAeff2cXjctJGJEmF1f3YzfVa5VDbrGAz4',
  authDomain: 'gen-lang-client-0279125580.firebaseapp.com',
  projectId: 'gen-lang-client-0279125580',
  storageBucket: 'gen-lang-client-0279125580.firebasestorage.app',
  messagingSenderId: '1030906824962',
  appId: '1:1030906824962:web:900284988fc708c687da1b',
  measurementId: 'G-QBP2QHDPEJ',
};

const app = initializeApp(firebaseConfig);

void isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
});
