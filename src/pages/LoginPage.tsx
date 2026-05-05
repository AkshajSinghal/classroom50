import { GraduationCap } from 'lucide-react'

const LoginPage = () => {
  return (
    <div className="hero bg-base-200 min-h-screen">
      <div className="hero-content flex-col lg:flex-row-reverse">
        <div className="card shadow-2xl w-full max-w-sm p-8">
          <div className="card-body items-center text-center">
            <GraduationCap />
            <p className="text-xl">Course Management</p>
            <p className="text-m">Manage programming assignments and student submissions via GitHub.</p>
            <hr />
            <p className="text-m">Sign in with your GitHub account to continue.</p>
            <button className="btn btn-neutral">Sign in with GitHub</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
