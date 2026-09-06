# SatQuery: Humanized 2.5–3 Minute Live Demo Video Script

**Target Duration**: 2 Minutes 30 Seconds – 2 Minutes 45 Seconds  
**Tone & Style**: Natural, conversational, energetic, and authentic — sounds like a passionate developer/founder walking someone through a live tool, not a robotic marketing pitch.  
**Video Setup**: Picture-in-picture webcam in the corner + full-screen browser at `http://localhost:5173` (1080p 60fps).

---

## 🎬 Master Video Script & Screen Action Timeline

```
TIME            WHAT'S ON SCREEN                                    WHAT YOU SAY (NATURAL, SPOKEN SCRIPT)
=========================================================================================================================================
0:00 - 0:25     [WEBCAM FULL SCREEN / CUT TO CLEAN SATQUERY UI]     "Hey everyone! 
(25 sec)                                                            
                Start with camera on you (smiling, high energy).    Imagine a flood strikes a district. First responders need to know 
                In 5 seconds, cut to full screen showing the sleek  within minutes: Which roads are cut off? Where is the water rising? 
                SatQuery dark interface.
                                                                    The problem? When you pull up regular satellite imagery during a monsoon,
                Cursor moves naturally across the top navbar.       all you see is a thick wall of clouds. On top of that, extracting useful 
                                                                    insights usually requires GIS experts and hours of manual processing.

                                                                    We wanted to fix that. 
                                                                    
                                                                    This is SatQuery — an intelligent platform where anyone can ask questions 
                                                                    about our planet in plain language, track land changes over time, and 
                                                                    fuse optical vision with microwave radar to see straight through clouds."

-----------------------------------------------------------------------------------------------------------------------------------------
0:25 - 0:55     [SCREEN: INTERACTIVE MAP & AUTOCOMPLETE]            "Let’s jump straight into the live prototype.
(30 sec)                                                            
                Click the search bar in the map toolbar.            To make targeting effortless, we built a Google Maps-style autocomplete 
                                                                    right into our geospatial map. 
                Type: "kedar"
                
                The dropdown instantly pops up with 'Kedarnath',    Watch — as I start typing 'kedar', SatQuery immediately suggests Kedarnath 
                category badge, and coordinates (30.73°N, 79.06°E). with exact coordinates and terrain context. 

                Hit Enter or click the suggestion.                  I'll select it, and the map smoothly flies straight to the Himalayan valley, 
                Map smoothly glides to Kedarnath.                   placing our observation reticle.

                Point cursor to the browser address bar:            And check out the browser address bar up here — notice how the URL just 
                `/?lat=30.7346&lon=79.0669&loc=Kedarnath`           updated in real time. Just like Google Maps, you can copy this exact link, 
                                                                    send it to your disaster response team, and when they open it, their 
                                                                    workspace loads this exact spot instantly."

-----------------------------------------------------------------------------------------------------------------------------------------
0:55 - 1:35     [SCREEN: VQA & TEMPORAL CHANGE DETECTION]           "Now, what can you actually ask it?
(40 sec)                                                            
                Click 'Visual Question Answering' tab.              Let’s hop into Visual Question Answering. I'll pick New Delhi along the 
                Click preset 'New Delhi' and suggestion chip:       Yamuna river and ask: 'Detect surface water bodies and urban drainage'.
                '+ Detect surface water bodies & channels'.
                                                                    When I hit 'Ask SatQuery', it pulls the clearest 10-meter Sentinel-2 
                Click 'Ask SatQuery'.                               optical scene and passes it to our vision pipeline. Look at that — not only 
                Result loads with clear narrative + cyan bounding   do we get a detailed geographical breakdown, but it also draws bounding 
                boxes over the river/water areas.                   boxes over detected water bodies with calibrated confidence scores.

                Click 'Change Detection' tab.                       Now, what if we want to see how this area changed over time?
                Pick Baseline: 2023-05-12 / Observation: 2024-05-12.
                Click 'Detect Temporal Change'.                     We switch to Change Detection, pick dates from 2023 and 2024, and hit detect. 
                                                                    Check out this interactive swipe slider — as I drag it back and forth, you 
                Smoothly drag the Before/After slider left & right. can clearly see seasonal water boundary shifts and urban expansion between 
                                                                    the two years. It's that intuitive."

-----------------------------------------------------------------------------------------------------------------------------------------
1:35 - 2:20     [SCREEN: MULTIMODAL SENSOR FUSION SPOTLIGHT]        "Now for our biggest breakthrough — Multimodal Sensor Fusion.
(45 sec)                                                            
                Click 'Sensor Fusion' in the top bar.               What happens when heavy storm clouds completely blind regular optical cameras?
                Select prompt:
                '+ Detect flood extent and standing water by fusing We switch to Sensor Fusion. Here, SatQuery dynamically pairs optical imagery 
                optical and SAR radar'.                             with Sentinel-1 C-band Synthetic Aperture Radar. 

                Click 'Analyze Sensor Fusion'.                      Because radar emits microwave pulses at 5.4 gigahertz, it punches straight 
                Radar scanner animation pulses for 1.5s, then loads through thick clouds, rain, and darkness. Smooth water reflects the signal 
                the 4-mode Fusion Inspector.                        away and appears pitch black, while concrete structures bounce back bright.

                1. Drag the 'Split Swipe' handle back & forth       Take a look at our Fusion Inspector:
                   across the center.                               - First, this Split Swipe lets us drag between optical terrain on the left 
                2. Click 'Opacity Blend' tab, slide to 50%,          and radar backscatter on the right.
                   then click 'Radar Only'.                         - In Opacity Blend, we can seamlessly cross-fade between sensors.
                3. Click 'Color Composite' tab.                     - We even have a False-Color Composite that overlays microwave backscatter 
                4. Scroll down slightly to show technical cards.     directly onto optical reflectance.

                                                                    Both layers are pixel-aligned at zoom 14, giving analysts 100% spatial 
                                                                    consistency."

-----------------------------------------------------------------------------------------------------------------------------------------
2:20 - 2:45     [SCREEN + WEBCAM: HONESTY PANEL & CLOSING]          "Finally, because real-world decisions depend on this data, SatQuery is 
(25 sec)                                                            built with strict scientific honesty. 
                Scroll down to the Honesty Panel & Confidence Flag.
                                                                    Our platform displays confidence metrics upfront and includes an Honesty Panel, 
                Cut back to full camera on you (confident smile).   so response teams know exactly when the AI is certain and when ground 
                                                                    verification is needed.

                Show closing slide / GitHub repo link.              SatQuery turns complex satellite streams into fast, reliable spatial 
                                                                    intelligence when seconds count. 

                                                                    Thank you so much!"
=========================================================================================================================================
```

---

## 🎙️ Natural Delivery Guide: How to Sound Human (Not Scripted)

1. **Talk to a Friend, Not an Audience**:
   - Instead of reading word-for-word, imagine you are showing a cool project you just built to a developer friend sitting next to you.
2. **Use Natural Fillers & Contractions**:
   - Say *"Let's"*, *"Here's"*, *"Look at that"*, *"Check this out"* instead of *"Let us observe"* or *"We will now demonstrate"*.
3. **Sync Your Hands with Your Words**:
   - When you say *"as I drag it back and forth"*, move the slider smoothly across the screen.
   - When you say *"check out the URL up here"*, move the mouse toward the address bar or highlight it.
4. **Energy Peaks**:
   - Elevate your energy at **1:35** when you introduce *Sensor Fusion* — that is the "wow" moment of your project.

---

## 📋 Quick Teleprompter Bullet Points (If You Prefer Speaking Freely)

- **0:00 (Hook)**: Floods & disaster blind spots &rarr; optical satellites can't see through clouds &rarr; meet SatQuery.
- **0:25 (Map & Autocomplete)**: Type `"Kedarnath"` &rarr; instant typeahead suggestion &rarr; smooth fly-to &rarr; live Google Maps-style URL syncing.
- **0:55 (VQA & Change Detection)**: New Delhi Yamuna query &rarr; 10m Sentinel-2 optical tile + AI bounding boxes &rarr; switch to Change Detection &rarr; swipe before/after slider.
- **1:35 (Sensor Fusion Spotlight)**: Overcoming clouds with Sentinel-1 SAR radar (5.4 GHz C-band) &rarr; show Split Swipe &rarr; Opacity Blend &rarr; False-Color Composite &rarr; pixel alignment at zoom 14.
- **2:20 (Wrap Up)**: Honesty Metric & calibrated confidence &rarr; fast, zero-hallucination spatial intelligence for emergency response &rarr; thank the judges/viewers.
