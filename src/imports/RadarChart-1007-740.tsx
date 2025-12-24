import svgPaths from "./svg-nquznjlmef";
import clsx from "clsx";
type SectionLabelText2Props = {
  text: string;
  additionalClassNames?: string;
};

function SectionLabelText2({ text, additionalClassNames = "" }: SectionLabelText2Props) {
  return (
    <div className={clsx("absolute", additionalClassNames)}>
      <p className="absolute font-['Heebo:Light',sans-serif] font-light inset-[0_-4.52%_-50%_0] leading-[normal] text-[12px] text-right text-white">{text}</p>
    </div>
  );
}
type SectionLabelText1Props = {
  text: string;
  additionalClassNames?: string;
};

function SectionLabelText1({ text, additionalClassNames = "" }: SectionLabelText1Props) {
  return (
    <div className={clsx("absolute", additionalClassNames)}>
      <p className="absolute font-['Heebo:Light',sans-serif] font-light inset-[0_-4.52%_-50%_0] leading-[normal] text-[12px] text-white">{text}</p>
    </div>
  );
}
type SectionLabelTextProps = {
  text: string;
  additionalClassNames?: string;
};

function SectionLabelText({ text, additionalClassNames = "" }: SectionLabelTextProps) {
  return (
    <div className={clsx("absolute", additionalClassNames)}>
      <p className="absolute font-['Heebo:Light',sans-serif] font-light inset-[0_-4.52%_-50%_0] leading-[normal] text-[12px] text-center text-white">{text}</p>
    </div>
  );
}

export default function RadarChart() {
  return (
    <div className="overflow-clip relative rounded-[8px] size-full" data-name="Radar Chart">
      <div className="absolute h-[401px] left-[calc(50%+0.5px)] top-[calc(50%+0.5px)] translate-x-[-50%] translate-y-[-50%] w-[763px]" data-name=".Shape">
        <div className="absolute left-[calc(50%-16.5px)] size-[340px] top-[calc(50%-0.5px)] translate-x-[-50%] translate-y-[-50%]" data-name="Rings">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 340 340">
            <g id="Rings">
              <path d={svgPaths.p26a77b00} id="Ring" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d={svgPaths.p2919f080} id="Ring_2" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d={svgPaths.p2781400} id="Ring_3" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d={svgPaths.p29f70c40} id="Ring_4" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d={svgPaths.p1b3d7870} id="Ring_5" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d={svgPaths.p1925b000} id="Ring_6" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d="M45 242.5L295 98" id="Ring_7" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d="M295.5 242.5L45 98" id="Ring_8" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
              <path d="M170 26V314.5" id="Ring_9" stroke="var(--stroke-0, white)" strokeOpacity="0.75" strokeWidth="0.6" />
            </g>
          </svg>
        </div>
        <SectionLabelText text="01" additionalClassNames="inset-[1.75%_42.2%_95.26%_38.4%]" />
        <SectionLabelText1 text="01" additionalClassNames="inset-[25.69%_11.93%_71.32%_68.68%]" />
        <SectionLabelText2 text="01" additionalClassNames="inset-[26.43%_72.48%_70.57%_8.13%]" />
        <SectionLabelText1 text="01" additionalClassNames="inset-[69.33%_11.93%_27.68%_68.68%]" />
        <SectionLabelText2 text="01" additionalClassNames="inset-[68.58%_72.48%_28.43%_8.13%]" />
        <SectionLabelText text="01" additionalClassNames="inset-[93.52%_42.33%_3.49%_38.27%]" />
      </div>
      <div className="absolute h-[243px] left-1/2 top-[calc(50%+0.5px)] translate-x-[-50%] translate-y-[-50%] w-[220px]" data-name="Data">
        <div className="absolute inset-[0_20%_0_0]" data-name="Data Style/Section 1/Solid">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 176 243">
            <g id="Data Style/Section 1/Solid">
              <path d={svgPaths.p32bf2c00} fill="var(--fill-0, #52ACFF)" fillOpacity="0.3" id="Vector 284" stroke="var(--stroke-0, #52ACFF)" strokeLinejoin="round" />
              <circle cx="112" cy="3" fill="var(--fill-0, #52ACFF)" id="Ellipse 43" r="3" />
              <circle cx="173" cy="98" fill="var(--fill-0, #52ACFF)" id="Ellipse 43_2" r="3" />
              <circle cx="171" cy="167" fill="var(--fill-0, #52ACFF)" id="Ellipse 43_3" r="3" />
              <circle cx="112" cy="240" fill="var(--fill-0, #52ACFF)" id="Ellipse 43_4" r="3" />
              <circle cx="47" cy="172" fill="var(--fill-0, #52ACFF)" id="Ellipse 43_5" r="3" />
              <circle cx="3" cy="72" fill="var(--fill-0, #52ACFF)" id="Ellipse 43_6" r="3" />
            </g>
          </svg>
        </div>
        <div className="absolute inset-[11.11%_0_10.7%_7.73%]" data-name="Data Style/Section 3/Solid">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 203 190">
            <g id="Data Style/Section 3/Solid">
              <circle cx="3" cy="179" fill="var(--fill-0, #FEDA33)" id="Ellipse 43" r="3" />
              <g id="Group 3">
                <path d={svgPaths.p22dd5800} fill="var(--fill-0, #FFD100)" fillOpacity="0.5" id="Vector 283" stroke="var(--stroke-0, #FEDA33)" strokeLinejoin="round" />
                <circle cx="113" cy="187" fill="var(--fill-0, #FEDA33)" id="Ellipse 43_2" r="3" />
                <circle cx="200" cy="167" fill="var(--fill-0, #FEDA33)" id="Ellipse 43_3" r="3" />
                <circle cx="76" cy="95" fill="var(--fill-0, #FEDA33)" id="Ellipse 43_4" r="3" />
                <circle cx="122" cy="110" fill="var(--fill-0, #FEDA33)" id="Ellipse 43_5" r="3" />
              </g>
              <circle cx="112" cy="3" fill="var(--fill-0, #FEDA33)" id="Ellipse 43_6" r="3" />
            </g>
          </svg>
        </div>
        <div className="absolute inset-[9.88%_0_9.88%_17.27%]" data-name="Data Style/Section 2/Solid">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 182 195">
            <g id="Data Style/Section 2/Solid">
              <path d={svgPaths.p139fa550} fill="var(--fill-0, #F8392F)" fillOpacity="0.3" id="Vector 282" stroke="var(--stroke-0, #F8392F)" strokeLinejoin="round" />
              <circle cx="75" cy="192" fill="var(--fill-0, #F8392F)" id="Ellipse 43" r="3" />
              <circle cx="179" cy="161" fill="var(--fill-0, #F8392F)" id="Ellipse 43_2" r="3" />
              <circle cx="145" cy="60" fill="var(--fill-0, #F8392F)" id="Ellipse 43_3" r="3" />
              <circle cx="75" cy="3" fill="var(--fill-0, #F8392F)" id="Ellipse 43_4" r="3" />
              <circle cx="3" cy="60" fill="var(--fill-0, #F8392F)" id="Ellipse 43_5" r="3" />
              <circle cx="48" cy="117" fill="var(--fill-0, #F8392F)" id="Ellipse 43_6" r="3" />
            </g>
          </svg>
        </div>
        <div className="absolute inset-[23.05%_29.55%_23.05%_21.36%]" data-name="Data Style/Section 4/Solid">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 108 131">
            <g id="Data Style/Section 4/Solid">
              <path d={svgPaths.p38e3c180} fill="var(--fill-0, #EF7BE3)" fillOpacity="0.3" id="Vector 281" stroke="var(--stroke-0, #EF7BE3)" strokeLinejoin="round" />
              <circle cx="105" cy="61" fill="var(--fill-0, #EF7BE3)" id="Ellipse 43" r="3" />
              <circle cx="55" cy="128" fill="var(--fill-0, #EF7BE3)" id="Ellipse 43_2" r="3" />
              <circle cx="3" cy="120" fill="var(--fill-0, #EF7BE3)" id="Ellipse 43_3" r="3" />
              <circle cx="31" cy="77" fill="var(--fill-0, #EF7BE3)" id="Ellipse 43_4" r="3" />
              <circle cx="56" cy="3" fill="var(--fill-0, #EF7BE3)" id="Ellipse 43_5" r="3" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}