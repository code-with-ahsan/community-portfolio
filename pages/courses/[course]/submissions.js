import axios from 'axios'
import qs from 'qs'
import Course from '../../../classes/Course.class'
import STRAPI_CONFIG from '../../../lib/strapiConfig'
import { useEffect, useState, useCallback } from 'react'
import logAnalyticsEvent from '../../../lib/utils/logAnalyticsEvent'
import { getCoursesForStaticPaths } from '../../../services/CourseService'
import { getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { deleteObject, getStorage, ref } from 'firebase/storage'
import { getFirestore, getDocs, collection, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { getFireStorageFileName } from '../../../lib/utils/queryParams'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import Spinner from '../../../components/Spinner'
import CoursePostLayout from '../../../layouts/CoursePostLayout'
import SubmissionWrapper from '../../../components/SubmissionWrapper'

const strapiUrl = process.env.STRAPI_URL
const strapiAPIKey = process.env.STRAPI_API_KEY
const auth = getAuth(getApp())
const storage = getStorage(getApp())
const firestore = getFirestore(getApp())

export async function getStaticPaths() {
  return getCoursesForStaticPaths()
}

export async function getStaticProps({ params }) {
  const { course: courseId } = params

  const query = qs.stringify(
    {
      populate: ['authors', 'authors.avatar', 'chapters', 'chapters.posts', 'resources'],
      publicationState: STRAPI_CONFIG.publicationState,
    },
    {
      encodeValuesOnly: true,
    }
  )
  const url = `${strapiUrl}/api/courses/${courseId}?${query}`
  const coursesResp = await axios.get(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Authorization: `Bearer ${strapiAPIKey}`,
    },
  })
  const course = new Course(coursesResp.data.data)
  return { props: { courseStr: JSON.stringify(course) } }
}

function CourseSubmissionsPage({ course }) {
  const [isDeletingSubmission, setIsDeletingSubmission] = useState(false)
  const [user, setUser] = useState(auth.currentUser)
  const [submissions, setSubmissions] = useState([])

  const getSubmissions = useCallback(async () => {
    const querySnapshot = await getDocs(
      collection(firestore, `cwa-web/project-submissions/${course.slug}`)
    )
    const submissionsList = []
    querySnapshot.forEach((doc) => {
      submissionsList.push(doc.data())
    })
    setSubmissions(submissionsList)
  }, [course.slug])

  useEffect(() => {
    logAnalyticsEvent('course_submissions_viewed', {
      courseSlug: course.slug,
    })
    const sub = auth.onAuthStateChanged((user) => {
      setUser(user)
    })
    getSubmissions()

    return () => {
      sub()
    }
  }, [course.slug, getSubmissions])

  const deleteProjectFileIfExists = async (docRef) => {
    const existingDoc = await getDoc(docRef)
    if (existingDoc.exists()) {
      const existingFileUrl = existingDoc.data().screenshotUrl
      const filePath = getFireStorageFileName(existingFileUrl)
      await deleteObject(ref(storage, filePath))
    }
  }

  const deleteSubmission = async () => {
    setIsDeletingSubmission(true)
    try {
      const docRef = doc(firestore, `cwa-web/project-submissions/${course.slug}/${user.uid}`)
      await deleteProjectFileIfExists(docRef)
      await deleteDoc(docRef)
      getSubmissions()
    } catch (e) {
      console.log(e)
    } finally {
      setIsDeletingSubmission(false)
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-4xl text-center">Submissions</h1>
      </header>
      <SubmissionWrapper
        user={user}
        submissionUrl={`cwa-web/project-submissions/${course.slug}/${user?.uid}`}
        submissionDeleted={getSubmissions}
        submissionDone={getSubmissions}
        submissionParams={{
          courseId: course.slug,
        }}
      >
        {submissions?.length > 0 ? (
          <ul className="submissions mt-8 grid grid-cols-auto-fit gap-5">
            {submissions.map((sub) => (
              <li
                key={sub.screenshotUrl}
                className="transition ease-in-out duration-150 rounded-md shadow-md relative hover:-translate-y-1 hover:shadow-lg hover:cursor-pointer"
              >
                {sub.by.uid === user?.uid && !isDeletingSubmission && (
                  <button
                    onClick={deleteSubmission}
                    className="hover:opacity-50 cursor-pointer absolute top-3 right-3"
                  >
                    <FontAwesomeIcon icon={faTrash} color={'red'} />
                  </button>
                )}
                {isDeletingSubmission ? (
                  <div className="flex items-center justify-center">
                    <Spinner></Spinner>
                  </div>
                ) : (
                  <a
                    href={sub.demoLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="overflow-hidden rounded-t-md flex items-center justify-center aspect-square bg-black/80"
                  >
                    <img src={sub.screenshotUrl} alt="" />
                  </a>
                )}

                <div className="p-5 border border-t-0 rounded-b-md border-gray-100">
                  <div className="flex items-center gap-4">
                    <img src={sub.by.photoURL} className="rounded-full w-12 h-12" />
                    <a href={sub.demoLink} target="_blank" rel="noreferrer noopener">
                      <h5 className="mb-2 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {sub.by.name}
                      </h5>
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <h2 className="text-2xl text-center my-8">No submissions yet</h2>
        )}
      </SubmissionWrapper>
    </>
  )
}

CourseSubmissionsPage.showAds = true

export default function PostPageWithLayout({ courseStr }) {
  const course = JSON.parse(courseStr)
  return (
    <CoursePostLayout
      ChildComponent={CourseSubmissionsPage}
      courseStr={courseStr}
      seo={{
        title: `${course.name} - Submissions`,
        description: `Project Submissions for ${course.name}`,
      }}
    ></CoursePostLayout>
  )
}
