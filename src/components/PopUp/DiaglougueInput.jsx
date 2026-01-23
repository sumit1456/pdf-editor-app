import React, { useState, forwardRef, useImperativeHandle } from "react";

const CustomInput = forwardRef((props, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [resolvePromise, setResolvePromise] = useState(null);
  const [demoResult, setDemoResult] = useState("");

  // Expose customInput method to parent
  const customInput = (inputTitle = "Input Required", inputLabel = "Please enter your input:", defaultValue = "") => {
    return new Promise((resolve) => {
      setTitle(inputTitle);
      setLabel(inputLabel);
      setInputValue(defaultValue);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  };

  useImperativeHandle(ref, () => ({
    customInput,
  }));

  const handleClose = (confirmed) => {
    if (resolvePromise) {
      resolvePromise(confirmed ? inputValue : null);
      setResolvePromise(null);
    }
    setIsOpen(false);
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleClose(true);
    if (e.key === "Escape") handleClose(false);
  };

  // Demo function to test internally
  const showDemo = async () => {
    const result = await customInput("Your Name", "Please type your name:", "John Doe");
    setDemoResult(result ? `You entered: ${result}` : "Cancelled input");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-5 relative overflow-hidden">
      {/* Floating background effects */}
      <div className="absolute w-[500px] h-[500px] rounded-full opacity-10 bg-gradient-radial from-white to-transparent -top-[250px] -right-[250px] animate-float" />
      <div className="absolute w-[400px] h-[400px] rounded-full opacity-8 bg-gradient-radial from-white to-transparent -bottom-[200px] -left-[200px] animate-float-reverse" />

      {/* Demo Section */}
      <div className="text-center relative z-10">
        <h1 className="gradient-text text-4xl font-bold mb-3 tracking-tight">Custom Input Dialog</h1>
        <p className="text-white/50 text-sm mb-10">Modern black & white themed input component</p>
        <button
          onClick={showDemo}
          className="modern-button bg-white text-black px-12 py-4 rounded-xl font-semibold text-sm tracking-wide shadow-modern hover:shadow-modern-hover hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
        >
          <span className="relative z-10">Open Input Dialog</span>
        </button>
        {demoResult && (
          <div className="mt-8 text-white text-base font-medium animate-fade-in">
            {demoResult}
          </div>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div
          className="backdrop-modern fixed inset-0 z-[1000] flex items-center justify-center animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && handleClose(false)}
        >
          <div className="glass-modal w-[90%] max-w-[420px] rounded-3xl overflow-hidden animate-slide-in">
            {/* Header */}
            <div className="bg-white/[0.03] text-white px-8 py-7 text-xl font-bold border-b border-white/8 tracking-tight">
              {title}
            </div>

            {/* Body */}
            <div className="p-8">
              <label className="block mb-3 text-white/70 text-sm font-medium tracking-wide">{label}</label>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type here..."
                autoFocus
                className="modern-input w-full px-5 py-3.5 text-base text-white rounded-xl outline-none transition-all placeholder:text-white/30"
              />
            </div>

            {/* Footer */}
            <div className="px-8 py-6 bg-black/20 flex gap-3 justify-end border-t border-white/8">
              <button
                onClick={() => handleClose(false)}
                className="px-7 py-3 text-sm font-semibold bg-white/8 text-white/80 border border-white/15 rounded-xl hover:bg-white/12 hover:text-white hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClose(true)}
                className="glow-button px-7 py-3 text-sm font-semibold bg-white text-black rounded-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        @keyframes float { 0%,100%{transform:translate(0,0);}50%{transform:translate(50px,50px);} }
        @keyframes float-reverse { 0%,100%{transform:translate(0,0);}50%{transform:translate(-50px,-50px);} }
        @keyframes fade-in { from {opacity:0;} to {opacity:1;} }
        @keyframes slide-in { from {transform:translateY(-30px) scale(0.95); opacity:0;} to {transform:translateY(0) scale(1); opacity:1;} }

        .animate-float { animation: float 20s infinite ease-in-out; }
        .animate-float-reverse { animation: float-reverse 15s infinite ease-in-out; }
        .animate-fade-in { animation: fade-in 0.3s ease; }
        .animate-slide-in { animation: slide-in 0.4s cubic-bezier(0.4,0,0.2,1); }

        .modern-button { position: relative; overflow: hidden; background: linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%); }
        .modern-button::before { content: ''; position: absolute; top:50%; left:50%; width:0;height:0; border-radius:50%; background: rgba(0,0,0,0.1); transform: translate(-50%,-50%); transition: width 0.6s, height 0.6s; }
        .modern-button:hover::before { width:300px; height:300px; }

        .glass-modal { background: linear-gradient(135deg, rgba(26,26,26,0.95) 0%, rgba(45,45,45,0.95) 100%); backdrop-filter: blur(20px); border:1px solid rgba(255,255,255,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.5),0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1); }

        .modern-input { background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .modern-input:focus { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.4); box-shadow: 0 0 0 4px rgba(255,255,255,0.05),0 4px 20px rgba(255,255,255,0.1); transform:translateY(-1px); }

        .gradient-text { background: linear-gradient(135deg,#ffffff 0%,#a0a0a0 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .shadow-modern { box-shadow: 0 4px 20px rgba(255,255,255,0.15), 0 0 1px rgba(255,255,255,0.5); }
        .shadow-modern-hover { box-shadow: 0 8px 30px rgba(255,255,255,0.25), 0 0 2px rgba(255,255,255,0.8); }

        .backdrop-modern { backdrop-filter: blur(12px) saturate(180%); background: rgba(0,0,0,0.85); }

        .glow-button { box-shadow: 0 2px 12px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.2); }
        .glow-button:hover { box-shadow: 0 6px 20px rgba(255,255,255,0.25), 0 0 30px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
});

export default CustomInput;
