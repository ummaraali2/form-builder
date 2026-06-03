import Head from 'next/head';

export default function Privacy() {
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Privacy Policy — Form Builder</title>
        <style>{`
          body{font-family:'Roboto',sans-serif;background:#f0ebf8;color:#202124;font-size:14px;min-height:100vh;margin:0;padding:0;}
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
          header{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12);padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
          header span{font-size:18px;color:#5f6368;}
          .back-btn{display:flex;align-items:center;gap:6px;color:#5f6368;font-size:14px;font-family:'Roboto',sans-serif;border:1px solid #dadce0;padding:0 14px;height:34px;border-radius:4px;background:#fff;cursor:pointer;transition:background .15s;}
          .back-btn:hover{background:#f1f3f4;}
          .container{max-width:720px;margin:40px auto;padding:0 24px 80px;}
          h1{font-size:28px;font-weight:400;margin-bottom:8px;color:#202124;}
          .updated{font-size:13px;color:#5f6368;margin-bottom:32px;}
          .card{background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15);padding:24px 28px;margin-bottom:16px;}
          h2{font-size:16px;font-weight:500;margin-bottom:12px;color:#202124;}
          p{font-size:14px;line-height:1.7;color:#5f6368;margin-bottom:10px;}
          p:last-child{margin-bottom:0;}
          ul{font-size:14px;line-height:1.7;color:#5f6368;padding-left:20px;}
          ul li{margin-bottom:6px;}
          a{color:#673ab7;}
          @media(max-width:480px){.container{padding:0 12px 60px;}.card{padding:16px 18px;}}
        `}</style>
      </Head>

      <header>
        <span>Form Builder</span>
        <button className="back-btn" onClick={() => { try { window.close(); } catch(e) { history.back(); } setTimeout(() => history.back(), 300); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to app
        </button>
      </header>

      <div className="container">
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: June 3, 2026 &nbsp;&middot;&nbsp; App available worldwide</p>

        <div className="card">
          <h2>Overview</h2>
          <p>Form Builder is a web application that allows you to paste questions and instantly generate Google Forms in your own Google account. We are committed to protecting your privacy and being transparent about how your information is used.</p>
        </div>

        <div className="card">
          <h2>What we access</h2>
          <p>When you sign in with Google, we request the following permissions:</p>
          <ul>
            <li><strong>Google Forms (create and edit)</strong> — to generate forms in your Google Drive</li>
            <li><strong>Google Drive (file access)</strong> — limited to files created by this app only</li>
            <li><strong>Basic profile information</strong> — your name and profile picture, displayed in the app header</li>
            <li><strong>Email address</strong> — to identify your account session</li>
          </ul>
          <p>We do not access your existing Google Drive files, emails, contacts, or any other Google services.</p>
        </div>

        <div className="card">
          <h2>What we store</h2>
          <p>We do not store any of your personal data on our servers. Specifically:</p>
          <ul>
            <li>Your questions, form titles, and answers are never sent to or stored by us</li>
            <li>Forms are created directly in your Google account via the Google Forms API</li>
            <li>Your Google access token is stored only in your browser memory and expires after 1 hour</li>
            <li>Draft questions are saved in your browser's local storage only — never on our servers</li>
          </ul>
        </div>

        <div className="card">
          <h2>Analytics and usage data</h2>
          <p>We collect basic, anonymous usage data to improve the app experience, including browser type, operating system, approximate location (country/city level), and pages visited. This data is collected using Google Analytics and does not identify you personally.</p>
        </div>

        <div className="card">
          <h2>Third-party services</h2>
          <p>This app uses the following third-party services:</p>
          <ul>
            <li><strong>Google Identity Services</strong> — for authentication</li>
            <li><strong>Google Forms API</strong> — to create forms in your account</li>
            <li><strong>Google Analytics</strong> — for anonymous usage statistics</li>
          </ul>
          <p>Each service has its own privacy policy. We encourage you to review Google's privacy policy at <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a>.</p>
        </div>

        <div className="card">
          <h2>Your rights</h2>
          <p>You may revoke this app's access to your Google account at any time by visiting <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a> and removing Form Builder. This immediately revokes all access tokens.</p>
          <p>Since we do not store your personal data, there is no additional data deletion required on our end.</p>
        </div>

        <div className="card">
          <h2>Children's privacy</h2>
          <p>This app is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13. If you believe a child has used this app, please contact us so we can take appropriate action.</p>
        </div>

        <div className="card">
          <h2>Changes to this policy</h2>
          <p>We may update this privacy policy from time to time. Any changes will be reflected on this page with an updated date. Continued use of the app after changes constitutes acceptance of the updated policy.</p>
        </div>

        <div className="card">
          <h2>Contact</h2>
          <p>If you have any questions, concerns, or requests regarding this privacy policy or your data, please contact us at <a href="mailto:gformbuilder@gmail.com">gformbuilder@gmail.com</a>. We will respond within 7 days.</p>
        </div>
      </div>
    </>
  );
}
