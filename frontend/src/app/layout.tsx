import "./globals.css";
import Nav from "../components/Nav";
export const metadata={title:"Urgent Medicine",description:"Medicine discovery and delivery platform"};
export default function RootLayout({children}:{children:React.ReactNode}){return <><Nav/>{children}</>}
